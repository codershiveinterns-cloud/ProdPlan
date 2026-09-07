/**
 * Products list URL contract (docs/M1_SPEC.md §5 "List URL contract"): `q`, `page` (1-based, 25/page), `sort`,
 * `dir` and the module filter `includeInactive=1`. Pure helpers shared by the page and the query layer.
 */

export const PRODUCTS_PAGE_SIZE = 25;

export const PRODUCT_SORT_KEYS = ["sku", "name", "unit", "bomLines", "routingSteps", "createdAt"] as const;
export type ProductSortKey = (typeof PRODUCT_SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export type ProductListParams = {
  q: string;
  page: number;
  sort: ProductSortKey;
  dir: SortDir;
  includeInactive: boolean;
};

export const DEFAULT_PRODUCT_LIST_PARAMS: ProductListParams = {
  q: "",
  page: 1,
  sort: "sku",
  dir: "asc",
  includeInactive: false,
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function isSortKey(v: string | undefined): v is ProductSortKey {
  return v !== undefined && (PRODUCT_SORT_KEYS as readonly string[]).includes(v);
}

/** Parses `searchParams` into a normalised, validated set of list parameters (unknown values fall back to defaults). */
export function parseProductListParams(raw: RawSearchParams): ProductListParams {
  const q = (first(raw.q) ?? "").trim().slice(0, 120);
  const pageNum = Number.parseInt(first(raw.page) ?? "", 10);
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? pageNum : 1;
  const sortRaw = first(raw.sort);
  const sort = isSortKey(sortRaw) ? sortRaw : DEFAULT_PRODUCT_LIST_PARAMS.sort;
  const dirRaw = first(raw.dir);
  const dir: SortDir = dirRaw === "desc" ? "desc" : "asc";
  const includeInactive = first(raw.includeInactive) === "1";
  return { q, page, sort, dir, includeInactive };
}

/** `/products?...` for the given parameters; defaults are omitted so URLs stay short and canonical. */
export function productListHref(params: ProductListParams, patch: Partial<ProductListParams> = {}): string {
  const p = { ...params, ...patch };
  const query = new URLSearchParams();
  if (p.q) query.set("q", p.q);
  if (p.includeInactive) query.set("includeInactive", "1");
  if (p.sort !== DEFAULT_PRODUCT_LIST_PARAMS.sort || p.dir !== DEFAULT_PRODUCT_LIST_PARAMS.dir) {
    query.set("sort", p.sort);
    query.set("dir", p.dir);
  }
  if (p.page > 1) query.set("page", String(p.page));
  const qs = query.toString();
  return qs ? `/products?${qs}` : "/products";
}

/** Number of active module filters (search is not a filter; it has its own "No results" treatment). */
export function countActiveProductFilters(params: ProductListParams): number {
  return params.includeInactive ? 1 : 0;
}
