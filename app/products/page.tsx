import ProductCatalog from "@/components/products/ProductCatalog";
import { getCategories, getProducts } from "@/lib/products/queries";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string;
    category?: string;
    categoryId?: string;
  }>;
}) {
  const params = await searchParams;
  const initialQuery = params?.q || "";
  const rawCategory = params?.category || params?.categoryId || "";

  const [itemCategories, products] = await Promise.all([
    getCategories(),
    getProducts(),
  ]);

  let initialCategoryIds: string[] = [];
  if (rawCategory) {
    const tokens = rawCategory
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const matched = itemCategories.filter((cat) => {
      const idStr = String(cat.category_id).toLowerCase();
      const nameStr = cat.category_name.toLowerCase();
      return tokens.some(
        (tok) => tok === idStr || tok === nameStr || nameStr.includes(tok),
      );
    });

    if (matched.length > 0) {
      initialCategoryIds = matched.map((m) => String(m.category_id));
    } else {
      initialCategoryIds = [rawCategory];
    }
  }

  return (
    <section className="min-h-screen bg-[#f8fafc] py-8 sm:py-10">
      <div className="mx-auto mb-20 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-7">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-600">
            ค้นหาอุปกรณ์ทั้งหมด
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-[#1b3554] sm:text-3xl">
            สินค้าสำหรับเช่า (Products)
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            ค้นหาอุปกรณ์ตามหมวดหมู่ ราคา คะแนน และวันที่ที่คุณต้องการเช่าใช้งาน
          </p>
        </div>

        <ProductCatalog
          key={`${initialQuery}-${initialCategoryIds.join(",")}`}
          itemCategories={itemCategories}
          products={products}
          initialSearchQuery={initialQuery}
          initialCategoryIds={initialCategoryIds}
        />
      </div>
    </section>
  );
}
