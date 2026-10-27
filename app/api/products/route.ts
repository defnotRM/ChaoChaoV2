import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, apiSuccess } from "@/lib/api-response";
import { uploadToStorage } from "@/lib/storage";
import {
  createProductSchema,
  listProductsQuerySchema,
} from "@/lib/validations/product";
import { getProducts } from "@/lib/products/queries";
import { saveItemCondition } from "@/lib/products/itemCondition";

export const dynamic = "force-dynamic";

// GET /api/products?q=&categoryId=&minPrice=&maxPrice=&province=&status=&sort=&page=&pageSize=
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const parsed = listProductsQuerySchema.safeParse({
      q: searchParams.get("q") ?? undefined,
      categoryId: searchParams.get("categoryId") ?? undefined,
      minPrice: searchParams.get("minPrice") ?? undefined,
      maxPrice: searchParams.get("maxPrice") ?? undefined,
      province: searchParams.get("province") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    const allProducts = await getProducts();

    if (!parsed.success) {
      return apiSuccess({
        items: allProducts,
        pagination: {
          page: 1,
          pageSize: allProducts.length,
          total: allProducts.length,
          totalPages: 1,
        },
      });
    }

    const { q, categoryId, minPrice, maxPrice, province, status, sort, page, pageSize } =
      parsed.data;

    let filtered = allProducts;

    if (status) {
      filtered = filtered.filter((p) => p.status === status);
    }
    if (q) {
      const queryLower = q.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.title.toLowerCase().includes(queryLower) ||
          p.description.toLowerCase().includes(queryLower)
      );
    }
    if (categoryId) {
      filtered = filtered.filter((p) => String(p.categoryId) === String(categoryId));
    }
    if (minPrice !== undefined) {
      filtered = filtered.filter((p) => p.pricePerDay >= minPrice);
    }
    if (maxPrice !== undefined) {
      filtered = filtered.filter((p) => p.pricePerDay <= maxPrice);
    }
    if (province) {
      filtered = filtered.filter((p) =>
        p.locations.some((l) => l.province.includes(province))
      );
    }

    if (sort === "price_asc") {
      filtered.sort((a, b) => a.pricePerDay - b.pricePerDay);
    } else if (sort === "price_desc") {
      filtered.sort((a, b) => b.pricePerDay - a.pricePerDay);
    } else {
      filtered.sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
      );
    }

    const total = filtered.length;
    const from = (page - 1) * pageSize;
    const items = filtered.slice(from, from + pageSize);

    return apiSuccess({
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Error in GET /api/products:", error);
    return apiError("ไม่สามารถดึงข้อมูลสินค้าได้", 500);
  }
}

// POST /api/products — สร้างสินค้าใหม่
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const body = await request.json();
    const parsed = createProductSchema.safeParse(body);

    if (!parsed.success) {
      const firstError =
        parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
      return apiError(firstError, 400, parsed.error.flatten());
    }

    const input = parsed.data;
    const admin = createAdminClient();

    if (!user) {
      return apiError("กรุณาเข้าสู่ระบบก่อนลงประกาศสินค้า", 401);
    }

    const userId = user.id;

    // ตรวจสอบการยืนยันตัวตนของผู้ให้เช่า (TC19 / FR-05)
    const [{ data: lenderProfile }, { data: lenderBank }] = await Promise.all([
      admin
        .from("useraccount")
        .select("id_card_url, id_card_selfie_url, identity_verification_status")
        .eq("user_id", userId)
        .maybeSingle(),
      admin
        .from("bankaccount")
        .select(
          "bank_account_id, bank_name, account_number, account_name, verification_status"
        )
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const isMissingKyc =
      !lenderProfile?.id_card_url ||
      !lenderProfile?.id_card_selfie_url ||
      !lenderBank?.account_number;

    if (isMissingKyc) {
      return apiError(
        "กรุณากรอกข้อมูลยืนยันตัวตน (รูปบัตรประชาชน รูปคู่บัตร และบัญชีธนาคาร) ให้ครบถ้วนก่อนลงประกาศสินค้า",
        403
      );
    }

    if (
      lenderProfile?.identity_verification_status !== "verified" ||
      lenderBank?.verification_status !== "verified"
    ) {
      return apiError(
        "บัญชีผู้ให้เช่าของคุณอยู่ระหว่างรอแอดมินตรวจสอบและยืนยันตัวตน จึงยังไม่สามารถลงประกาศสินค้าได้",
        403
      );
    }

    const processedImages = await Promise.all(
      (input.images || []).map(async (img, idx) => {
        let finalUrl = img.imageUrl;
        if (finalUrl && finalUrl.startsWith("data:")) {
          const res = await uploadToStorage("items", userId, finalUrl);
          finalUrl = res.publicUrl;
        }
        return {
          image_url: finalUrl,
          is_primary: img.isPrimary ?? (idx === 0),
          sequence: img.sequence ?? idx,
        };
      })
    );

    const { data: itemId, error } = await admin.rpc("create_item_listing", {
      p_user_id: userId,
      p_category_id: input.categoryId ?? null,
      p_item_name: input.itemName,
      p_description: input.description || "",
      p_original_price: input.originalPrice ?? null,
      p_rental_fee_per_day: input.rentalFeePerDay,
      p_deposit: input.deposit,
      p_images: processedImages,
      p_locations: (input.locations || []).map((loc) => ({
        description: loc.description || "จุดนัดรับที่ตกลงกัน",
        no: loc.no || "-",
        alley: loc.alley || null,
        road: loc.road || null,
        subdistrict: loc.subdistrict || "",
        district: loc.district || "",
        province: loc.province || "กรุงเทพมหานคร",
        location_type: loc.location_type || "both",
      })),
      p_availability_start: input.availabilityStart,
      p_availability_end: input.availabilityEnd,
      p_conditions: input.conditions || [],
    });

    if (error) {
      console.error("Error creating item listing:", error);
      return apiError("ไม่สามารถสร้างประกาศสินค้าได้", 500, error.message);
    }

    await saveItemCondition(admin, String(itemId), input.condition);

    return apiSuccess(
      { message: "สร้างประกาศสินค้าสำเร็จ", itemId: String(itemId) },
      201
    );
  } catch (error) {
    console.error("Error in POST /api/products:", error);
    return apiError("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์", 500);
  }
}
