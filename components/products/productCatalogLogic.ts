import type { ItemCategoryRow, Product } from "@/lib/types/product";

export type CatalogSort =
  | "rating-desc"
  | "newest"
  | "price-asc"
  | "price-desc";

export type ProductFilterState = {
  searchQuery: string;
  selectedCategoryIds: string[];
  minPrice: string;
  maxPrice: string;
  minRating: number;
  startDate: string;
  endDate: string;
  onlyAvailable: boolean;
};

export type ProductFilterCriteria = {
  searchQuery: string;
  minPrice: number | null;
  maxPrice: number | null;
  minRating: number;
  startDate: string;
  endDate: string;
  onlyAvailable: boolean;
  hasInvalidRange: boolean;
};

export type ProductCategoryOption = {
  id: string;
  name: string;
  count: number;
};

// วรรณยุกต์และสระบน-ล่างของไทยต้องติดกับพยัญชนะตัวก่อนหน้า ถ้าคำที่เจอมีตัวพวกนี้ต่อท้าย แปลว่าตัดกลางพยางค์ (เช่น "ไม" ใน "ไม่")
const THAI_COMBINING_MARK = /[ัิ-ฺ็-๎]/;
// สระหน้า (เ แ โ ใ ไ) เป็นส่วนหนึ่งของพยางค์ที่ตามมา คำที่เจอจึงต้องไม่เริ่มหลังสระหน้า (เช่น "มว" ใน "แมว")
const THAI_LEADING_VOWEL = /[เ-ไ]/;

function normalizeSearchText(text: string) {
  return text.normalize("NFC").toLowerCase();
}

// ชื่อรุ่นเขียนได้หลายแบบ เช่น "A7 III", "A7-III", "a7iii" จึงเทียบแบบตัดช่องว่างและขีดออกด้วย
function compactModelText(text: string) {
  return text.replace(/[\s\-_]/g, "");
}

export function includesThaiAware(text: string, query: string) {
  for (
    let index = text.indexOf(query);
    index !== -1;
    index = text.indexOf(query, index + 1)
  ) {
    const before = text[index - 1] ?? "";
    const after = text[index + query.length] ?? "";
    if (!THAI_LEADING_VOWEL.test(before) && !THAI_COMBINING_MARK.test(after)) {
      return true;
    }
  }
  return false;
}

function fieldIncludes(field: string, token: string) {
  if (includesThaiAware(field, token)) return true;
  // เทียบแบบตัดช่องว่างเฉพาะคำที่มีตัวอักษรอังกฤษหรือตัวเลข เพื่อไม่ให้คำไทยต่างคำถูกนำมาต่อกัน
  return (
    /[a-z0-9]/.test(token) &&
    includesThaiAware(compactModelText(field), compactModelText(token))
  );
}

// คืนคะแนนความเกี่ยวข้อง หรือ null ถ้าไม่ตรงคำค้น
// ทุกคำที่พิมพ์ (แยกด้วยช่องว่าง) ต้องเจออย่างน้อยหนึ่งช่อง และคะแนนนับจากช่องที่สำคัญที่สุดที่เจอ
export function getSearchRelevance(product: Product, searchQuery: string) {
  if (!searchQuery) return 0;

  const title = normalizeSearchText(product.title ?? "");
  const category = normalizeSearchText(product.categoryName ?? "");
  const description = normalizeSearchText(product.description ?? "");
  let relevance = 0;

  for (const token of searchQuery.split(/\s+/)) {
    if (fieldIncludes(title, token)) {
      const startsTitle =
        title.startsWith(token) &&
        !THAI_COMBINING_MARK.test(title[token.length] ?? "");
      relevance += startsTitle ? 3 : 2;
    } else if (fieldIncludes(category, token)) {
      relevance += 1;
    } else if (!fieldIncludes(description, token)) {
      return null;
    }
  }

  return relevance;
}

export function createInitialProductFilters(
  initialSearch = "",
  initialCategoryIds: string[] = [],
): ProductFilterState {
  return {
    searchQuery: initialSearch,
    selectedCategoryIds: initialCategoryIds,
    minPrice: "",
    maxPrice: "",
    minRating: 0,
    startDate: "",
    endDate: "",
    onlyAvailable: true,
  };
}

// วันนี้ตามเวลาไทยในรูปแบบ YYYY-MM-DD (en-CA ให้รูปแบบนี้) ใช้เป็นวันแรกสุดที่เลือกเช่าได้
export function getTodayInBangkok(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(
    now,
  );
}

export function createFilterCriteria(
  filters: ProductFilterState,
  today = getTodayInBangkok(),
) {
  // ค่าในช่องราคาเก็บเป็น string เพื่อให้ input ว่างได้ ก่อนแปลงเป็นตัวเลขสำหรับกรองสินค้า
  const minPrice = filters.minPrice === "" ? null : Number(filters.minPrice);
  const maxPrice = filters.maxPrice === "" ? null : Number(filters.maxPrice);

  // ตรวจช่วงที่ผู้ใช้กรอกผิด เพื่อแสดงข้อความเตือนและไม่คืนสินค้าระหว่างที่ช่วงยังไม่ถูกต้อง
  const invalidPriceRange =
    minPrice !== null && maxPrice !== null && minPrice > maxPrice;
  const invalidDateRange = Boolean(
    filters.startDate &&
      filters.endDate &&
      filters.startDate > filters.endDate,
  );
  // input type="date" กัน min ได้แค่ในปฏิทิน แต่ยังพิมพ์วันย้อนหลังเองได้ จึงตรวจซ้ำที่นี่
  const invalidPastDate = Boolean(
    (filters.startDate && filters.startDate < today) ||
      (filters.endDate && filters.endDate < today),
  );

  const criteria: ProductFilterCriteria = {
    searchQuery: normalizeSearchText((filters.searchQuery || "").trim()),
    minPrice,
    maxPrice,
    minRating: filters.minRating,
    startDate: filters.startDate,
    endDate: filters.endDate,
    onlyAvailable: filters.onlyAvailable,
    hasInvalidRange: invalidPriceRange || invalidDateRange || invalidPastDate,
  };

  return { criteria, invalidPriceRange, invalidDateRange, invalidPastDate };
}

export function matchesNonCategoryFilters(
  product: Product,
  criteria: ProductFilterCriteria,
) {
  if (criteria.hasInvalidRange) return false;
  // สินค้าที่ผู้ให้เช่าซ่อนไว้ (inactive) ต้องไม่แสดงในหน้าค้นหาสาธารณะ
  if (product.status === "inactive") return false;

  // ค้นหาตามคำค้นหา (ชื่อสินค้า, รายละเอียด, หมวดหมู่)
  const matchesSearch =
    getSearchRelevance(product, criteria.searchQuery) !== null;

  const matchesMinPrice =
    criteria.minPrice === null || product.pricePerDay >= criteria.minPrice;
  const matchesMaxPrice =
    criteria.maxPrice === null || product.pricePerDay <= criteria.maxPrice;
  const matchesRating = product.rating >= criteria.minRating;
  const matchesStatus =
    !criteria.onlyAvailable || product.status === "available";

  // สินค้าต้องมีช่วง availability อย่างน้อยหนึ่งช่วงที่ครอบคลุมวันเริ่มและวันคืนทั้งหมด
  const matchesDate =
    (!criteria.startDate && !criteria.endDate) ||
    product.availability.some((range) => {
      const containsStart =
        !criteria.startDate ||
        (range.startDate <= criteria.startDate &&
          range.endDate >= criteria.startDate);
      const containsEnd =
        !criteria.endDate ||
        (range.startDate <= criteria.endDate &&
          range.endDate >= criteria.endDate);

      return containsStart && containsEnd;
    });

  return (
    matchesSearch &&
    matchesMinPrice &&
    matchesMaxPrice &&
    matchesRating &&
    matchesStatus &&
    matchesDate
  );
}

export function buildCategoryOptions(
  itemCategories: ItemCategoryRow[],
  products: Product[],
  criteria: ProductFilterCriteria,
): ProductCategoryOption[] {
  const categoryMap = new Map<string, ProductCategoryOption>();

  // เริ่มจากหมวดหมู่ทั้งหมด เพื่อให้หมวดที่ยังไม่มีสินค้ายังคงแสดงด้วย count 0
  itemCategories.forEach((category) => {
    categoryMap.set(String(category.category_id), {
      id: String(category.category_id),
      name: category.category_name,
      count: 0,
    });
  });

  // count คำนวณจากตัวกรองอื่น แต่ไม่รวมหมวดหมู่ เพื่อให้ผู้ใช้เห็นจำนวนก่อนเลือกหมวด
  products.forEach((product) => {
    const current = categoryMap.get(product.categoryId);
    categoryMap.set(product.categoryId, {
      id: product.categoryId,
      name: current?.name ?? product.categoryName,
      count:
        (current?.count ?? 0) +
        Number(matchesNonCategoryFilters(product, criteria)),
    });
  });

  return Array.from(categoryMap.values()).sort((a, b) => {
    // วางหมวด "อื่นๆ" ไว้ท้ายรายการเสมอ ส่วนหมวดที่เหลือเรียงตามภาษาไทย
    if (a.name === "อื่นๆ") return 1;
    if (b.name === "อื่นๆ") return -1;
    return a.name.localeCompare(b.name, "th");
  });
}

export function filterProducts(
  products: Product[],
  selectedCategoryIds: string[],
  criteria: ProductFilterCriteria,
) {
  return products.filter((product) => {
    // ถ้ายังไม่เลือกหมวด ให้ผ่านทุกหมวด; ถ้าเลือกแล้ว สินค้าต้องอยู่ในหมวดที่เลือก
    const matchesCategory =
      selectedCategoryIds.length === 0 ||
      selectedCategoryIds.includes(product.categoryId);

    return matchesCategory && matchesNonCategoryFilters(product, criteria);
  });
}

export function sortProducts(
  products: Product[],
  sortBy: CatalogSort,
  searchQuery = "",
) {
  const relevance = new Map(
    products.map((product) => [
      product.id,
      getSearchRelevance(product, searchQuery) ?? 0,
    ]),
  );

  // sort แก้ array ต้นฉบับ จึง copy ก่อนเพื่อไม่ให้ข้อมูลจาก props ถูกเปลี่ยน
  return [...products].sort((a, b) => {
    // ตอนมีคำค้น สินค้าที่ตรงชื่อขึ้นก่อนสินค้าที่ตรงแค่หมวดหรือรายละเอียด แล้วค่อยเรียงตามที่ผู้ใช้เลือก
    const relevanceDiff =
      (relevance.get(b.id) ?? 0) - (relevance.get(a.id) ?? 0);
    if (relevanceDiff !== 0) return relevanceDiff;

    if (sortBy === "newest") {
      return b.createdAt.localeCompare(a.createdAt);
    }
    if (sortBy === "price-asc") {
      return a.pricePerDay - b.pricePerDay;
    }
    if (sortBy === "price-desc") {
      return b.pricePerDay - a.pricePerDay;
    }

    // ค่าเริ่มต้นเรียงคะแนนสูงไปต่ำ และใช้จำนวนรีวิวเป็นตัวตัดสินเมื่อคะแนนเท่ากัน
    return b.rating - a.rating || b.reviewCount - a.reviewCount;
  });
}
