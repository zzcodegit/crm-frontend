const API_BASE = "/api";

function getToken(): string | null {
  return localStorage.getItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: HeadersInit = { "Content-Type": "application/json", ...options.headers };
  const token = getToken();
  if (token) (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem("token");
    throw new Error("Неверный логин или пароль");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Ошибка запроса");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text.trim()) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

async function requestMultipart<T>(path: string, formData: FormData, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...options, method: options.method || "POST", body: formData, headers });
  if (res.status === 401) {
    localStorage.removeItem("token");
    throw new Error("Неверный логин или пароль");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Ошибка загрузки");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface UserItem {
  id: number;
  username: string;
  is_active: boolean;
  first_name?: string | null;
  last_name?: string | null;
  patronymic?: string | null;
  telegram_id?: string | null;
  group_ids?: number[];
  last_login_at?: string | null;
}
export interface GroupItem {
  id: number;
  name: string;
}
export type GroupPermissionsResponse = {
  permissions: Record<string, string[]>;
};
export interface OrderLineItem {
  id: number;
  order_id: number;
  line_number: number;
  product_id: number | null;
  characteristic_id: number | null;
  nomenclature: string | null;
  quantity: number;
  price: number;
  percent_manual: number | null;
  sum_manual: number | null;
  sum: number;
  vat_rate_id: number | null;
  product_name: string | null;
  characteristic_name: string | null;
  vat_rate_name: string | null;
}
export interface OrderItem {
  id: number;
  status: string | null;
  order_status_id: number | null;
  order_status_name: string | null;
  priority_id: number | null;
  priority_name: string | null;
  consultant_id: number | null;
  consultant: string | null;
  order_number: string | null;
  date: string | null;
  readiness_date: string | null;
  client_id: number | null;
  client: string | null;
  age: number | null;
  phone: string | null;
  sms: boolean;
  call: string | null;
  prepayment: number | null;
  card: boolean;
  cash: boolean;
  extra_payment: number | null;
  od_sph: string | null;
  od_cyl: string | null;
  od_axis: string | null;
  od_pd: string | null;
  od_add_deg: string | null;
  od_height: string | null;
  diametr: string | null;
  os_sph: string | null;
  os_cyl: string | null;
  os_axis: string | null;
  os_pd: string | null;
  os_add_deg: string | null;
  os_height: string | null;
  for_what: string | null;
  frame_article: string | null;
  print_info: string | null;
  promotion: boolean;
  prescription_order: boolean;
  child_order: boolean;
  no_lenses: boolean;
  client_frame_lenses: boolean;
  case_included: boolean;
  from_client_words: boolean;
  doctor_prescription: boolean;
  doctor_name: string | null;
  clinic: string | null;
  by_client_glasses: boolean;
  demo_mo: boolean;
  price_includes_vat: boolean;
  organization_id: number | null;
  organization_name: string | null;
  department_id: number | null;
  department_name: string | null;
  warehouse: string | null;
  warehouse_id: number | null;
  warehouse_name: string | null;
  author_id: number | null;
  author_name: string | null;
  ship_one_date: boolean;
  ship_date: string | null;
  total: number;
  comment: string | null;
  created_at: string | null;
  items: OrderLineItem[];
}
export interface RefItem {
  id: number;
  name: string;
}

export interface WarehouseItem {
  id: number;
  name: string;
  manager_id?: number | null;
  manager_name?: string | null;
}

export interface ReportItem {
  id: number;
  created_at: string | null;
  user_id: number;
  user_username: string;
  warehouse_id: number | null;
  warehouse_name: string;
  utro: number | null;
  revenue: number | null;
  nal: number | null;
  bn: number | null;
  ost: number | null;
  is_draft?: boolean;
  has_returns: boolean;
  return_bn: number | null;
  return_nal: number | null;
  returns_details?: { date_check: string | null; consultant_last_name: string | null; return_reason?: string | null; amount?: number | null }[];
  bn_card_reconciliation: number | null;
  bn_z_report: number | null;
  extra_payments: { amount: number; order_number: string; consultant_last_name?: string | null }[];
  vyhod: number | null;
  percent: number | null;
  vzyala: number | null;
  dolg: number | null;
  z_report_urls: string[];
  card_reconciliation_urls: string[];
}

export interface PricelistGroupItem {
  id: number;
  name: string;
  sort_index: number;
  display_properties_in_list: boolean;
}

export interface CountryItem {
  id: number;
  name: string;
  code?: string;
}

export interface ManufacturerItem {
  id: number;
  name: string;
  description?: string;
  country_id?: number;
  image_url?: string;
  catalog_pdf_url?: string | null;
  country?: CountryItem;
}

export interface FeatureItem {
  id: number;
  name: string;
  icon_url?: string;
  color?: string;
  colors?: string[];
}

export interface PricelistItemResponse {
  id: number;
  manufacturer_id: number | null;
  manufacturer_name: string;
  lens_name: string;
  description?: string | null;
  full_description?: string | null;
  barcode?: string | null;
  barcodes?: { code: string; price?: number | null; description?: string | null }[];
  photo_url?: string | null;
  photo_urls?: string[];
  sph?: string | null;
  cyl?: string | null;
  step?: string | null;
  diameters?: string | null;
  price: number;
  is_promo?: boolean;
  uv_protection?: boolean;
  material?: string | null;
  lens_id?: number | null;
  group: string;
  coefficient?: string | null;
  feature_ids: number[];
  feature_colors?: Record<string, string[]>; // feature_id (str) -> список цветов
  custom_values?: Record<string, string | string[] | boolean | null>;
}

export interface CustomFieldOptionItem {
  id: number;
  value: string;
  sort_index: number;
  is_active: boolean;
}

export interface CustomFieldItem {
  id: number;
  code: string;
  label: string;
  field_type: "string" | "select" | "multi_select" | "checkbox" | "reference";
  is_required: boolean;
  is_active: boolean;
  sort_index: number;
  options: CustomFieldOptionItem[];
}

export interface PortalTaskItem {
  id: number;
  title: string;
  description?: string | null;
  status: "new" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  created_by_user_id?: number | null;
  created_by_username?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface SupplyTicketItem {
  id: number;
  warehouse_id?: number | null;
  warehouse_name?: string | null;
  request_text: string;
  created_by_user_id?: number | null;
  created_by_username?: string | null;
  status: "open" | "closed";
  created_at?: string | null;
  updated_at?: string | null;
}

export interface SupplyTicketMessageItem {
  id: number;
  ticket_id: number;
  author_user_id?: number | null;
  author_username?: string | null;
  message: string;
  created_at?: string | null;
}

export interface ProductRefItem {
  id: number;
  name: string;
  code: string | null;
}
export interface ProductCharItem {
  id: number;
  product_id: number;
  name: string;
}

// --- Chat ---

export type ChatMediaType = "image" | "video";

export interface ChatAttachment {
  id: number;
  url: string;
  media_type: ChatMediaType;
  filename?: string | null;
  mime_type?: string | null;
  created_at?: string | null;
}

export interface ChatMessageSender {
  id: number;
  username: string;
  display_name: string;
}

export interface ChatMessageItem {
  id: number;
  private_dialog_id: number | null;
  group_dialog_id?: number | null;
  sender: ChatMessageSender | null;
  display_text: string | null;
  is_deleted: boolean;
  created_at: string | null;
  edited_at: string | null;
  attachments: ChatAttachment[];
  reply_to_message_id?: number | null;
  reply_to_text?: string | null;
  reply_to_sender_name?: string | null;
  reply_to_is_deleted?: boolean;
  is_read?: boolean;
}

export interface ChatUserShortResponse {
  id: number;
  username: string;
  display_name: string;
  is_active: boolean;
}

export interface PrivateDialogItem {
  id: number;
  other_user: {
    id: number;
    username: string;
    display_name: string;
    is_active: boolean;
  };
  last_message_text: string | null | undefined;
  last_message_at: string | null | undefined;
}

export interface GroupDialogItem {
  id: number;
  name: string;
  last_message_text: string | null | undefined;
  last_message_at: string | null | undefined;
}

export interface GroupMemberItem {
  user: ChatUserShortResponse;
  is_admin: boolean;
  is_active: boolean;
  joined_at: string | null | undefined;
  left_at: string | null | undefined;
}

export interface ChatNotificationSummary {
  unread_count: number;
  last_message_text?: string | null;
  last_message_sender?: string | null;
  last_message_chat?: string | null;
}


export const api = {
  login(username: string, password: string) {
    return request<{ access_token: string; token_type: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  setupPassword(username: string, password: string, password_confirm: string) {
    return request<{ access_token: string; token_type: string }>("/auth/setup-password", {
      method: "POST",
      body: JSON.stringify({ username, password, password_confirm }),
    });
  },
  getMe() {
    return request<UserItem & { is_admin: boolean; is_manager?: boolean; is_consultant?: boolean; role?: string }>("/auth/me");
  },
  getUsers: () => request<UserItem[]>("/users"),
  getUser: (id: number) => request<UserItem>(`/users/${id}`),
  createUser: (data: { username: string; password: string; first_name?: string; last_name?: string; patronymic?: string; telegram_id?: string }) =>
    request<UserItem>("/users", { method: "POST", body: JSON.stringify(data) }),
  inviteUser: (fio: string) =>
    request<UserItem>("/users/invite", {
      method: "POST",
      body: JSON.stringify({ fio }),
    }),
  updateUser: (id: number, data: { first_name?: string; last_name?: string; patronymic?: string; telegram_id?: string; is_active?: boolean; password?: string }) =>
    request<UserItem>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteUser: (id: number) => request(`/users/${id}`, { method: "DELETE" }),
  getGroups: () => request<GroupItem[]>("/groups"),
  createGroup: (name: string) => request<GroupItem>("/groups", { method: "POST", body: JSON.stringify({ name }) }),
  deleteGroup: (id: number) => request(`/groups/${id}`, { method: "DELETE" }),
  addGroupMember: (groupId: number, userId: number) =>
    request(`/groups/${groupId}/members/${userId}`, { method: "POST" }),
  removeGroupMember: (groupId: number, userId: number) =>
    request(`/groups/${groupId}/members/${userId}`, { method: "DELETE" }),
  getGroupPermissions: () => request<GroupPermissionsResponse>("/settings/group-permissions"),
  updateGroupPermissions: (permissions: Record<string, string[]>) =>
    request<GroupPermissionsResponse>("/settings/group-permissions", {
      method: "PUT",
      body: JSON.stringify({ permissions }),
    }),
  portalTasks: {
    list: () => request<PortalTaskItem[]>("/portal-tasks"),
    create: (d: { title: string; description?: string; status?: "new" | "in_progress" | "done"; priority?: "low" | "medium" | "high" }) =>
      request<PortalTaskItem>("/portal-tasks", { method: "POST", body: JSON.stringify(d) }),
    update: (id: number, d: Partial<{ title: string; description: string; status: "new" | "in_progress" | "done"; priority: "low" | "medium" | "high" }>) =>
      request<PortalTaskItem>(`/portal-tasks/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
    delete: (id: number) => request(`/portal-tasks/${id}`, { method: "DELETE" }),
  },
  supplyTickets: {
    list: (limit: number = 15, offset: number = 0, status: "open" | "closed" | "all" = "open") =>
      request<{ items: SupplyTicketItem[]; total: number; limit: number; offset: number }>(
        `/supply-tickets?limit=${limit}&offset=${offset}&status=${status}`
      ),
    create: (d: { warehouse_id?: number | null; request_text: string }) =>
      request<SupplyTicketItem>("/supply-tickets", { method: "POST", body: JSON.stringify(d) }),
    updateStatus: (ticketId: number, status: "open" | "closed") =>
      request<SupplyTicketItem>(`/supply-tickets/${ticketId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    messages: (ticketId: number) => request<SupplyTicketMessageItem[]>(`/supply-tickets/${ticketId}/messages`),
    sendMessage: (ticketId: number, message: string) =>
      request<SupplyTicketMessageItem>(`/supply-tickets/${ticketId}/messages`, { method: "POST", body: JSON.stringify({ message }) }),
  },
  getOrders: (statusFilter?: "new" | "accepted" | "all", offset?: number) => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status_filter", statusFilter);
    if (offset != null) params.set("offset", String(offset));
    return request<{ items: OrderItem[]; has_more: boolean }>(`/orders${params.toString() ? `?${params}` : ""}`);
  },
  getOrder: (id: number) => request<OrderItem>(`/orders/${id}`),
  acceptOrder: (id: number) => request<OrderItem>(`/orders/${id}/accept`, { method: "PATCH" }),
  reports: {
    list: () =>
      request<ReportItem[]>("/reports"),
    create: (d: {
      warehouse_id?: number;
      utro?: number;
      revenue?: number;
      nal?: number;
      bn?: number;
      ost?: number;
      is_draft?: boolean;
      has_returns?: boolean;
      return_bn?: number;
      return_nal?: number;
      returns_details?: { date_check: string | null; consultant_last_name: string | null; return_reason?: string | null; amount?: number }[];
      bn_card_reconciliation?: number;
      bn_z_report?: number;
      extra_payments?: { amount: number; order_number: string; consultant_last_name?: string | null }[];
      vyhod?: number;
      percent?: number;
      vzyala?: number;
      dolg?: number;
      z_report_urls?: string[];
      card_reconciliation_urls?: string[];
    }) => request<{ id: number }>("/reports", { method: "POST", body: JSON.stringify(d) }),
    getDraft: () => request<ReportItem | null>("/reports/draft"),
    consultants: () => request<{ id: number; last_name: string }[]>("/reports/consultants"),
    getWarehouseLastOst: (warehouseId: number) => request<{ ost: number | null }>(`/reports/warehouse/${warehouseId}/last-ost`),
  },
  pricelist: {
    list: () => request<PricelistItemResponse[]>("/pricelist"),
    get: (id: number) => request<PricelistItemResponse>(`/pricelist/${id}`),
  },
  ref: {
    organizations: { list: () => request<RefItem[]>("/ref/organizations"), create: (d: { name: string }) => request<RefItem>("/ref/organizations", { method: "POST", body: JSON.stringify(d) }), update: (id: number, d: { name: string }) => request<RefItem>(`/ref/organizations/${id}`, { method: "PATCH", body: JSON.stringify(d) }), delete: (id: number) => request(`/ref/organizations/${id}`, { method: "DELETE" }) },
    departments: { list: () => request<RefItem[]>("/ref/departments"), create: (d: { name: string }) => request<RefItem>("/ref/departments", { method: "POST", body: JSON.stringify(d) }), update: (id: number, d: { name: string }) => request<RefItem>(`/ref/departments/${id}`, { method: "PATCH", body: JSON.stringify(d) }), delete: (id: number) => request(`/ref/departments/${id}`, { method: "DELETE" }) },
    warehouses: {
      list: () => request<WarehouseItem[]>("/ref/warehouses"),
      get: (id: number) => request<WarehouseItem>(`/ref/warehouses/${id}`),
      create: (d: { name: string; manager_id?: number | null }) => request<WarehouseItem>("/ref/warehouses", { method: "POST", body: JSON.stringify(d) }),
      update: (id: number, d: { name?: string; manager_id?: number | null }) => request<WarehouseItem>(`/ref/warehouses/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
      delete: (id: number) => request(`/ref/warehouses/${id}`, { method: "DELETE" }),
    },
    managers: () => request<{ id: number; username: string; first_name?: string; last_name?: string; display_name: string }[]>("/ref/managers"),
    authors: { list: () => request<RefItem[]>("/ref/authors"), create: (d: { name: string }) => request<RefItem>("/ref/authors", { method: "POST", body: JSON.stringify(d) }), update: (id: number, d: { name: string }) => request<RefItem>(`/ref/authors/${id}`, { method: "PATCH", body: JSON.stringify(d) }), delete: (id: number) => request(`/ref/authors/${id}`, { method: "DELETE" }) },
    vatRates: { list: () => request<RefItem[]>("/ref/vat-rates"), create: (d: { name: string }) => request<RefItem>("/ref/vat-rates", { method: "POST", body: JSON.stringify(d) }), update: (id: number, d: { name: string }) => request<RefItem>(`/ref/vat-rates/${id}`, { method: "PATCH", body: JSON.stringify(d) }), delete: (id: number) => request(`/ref/vat-rates/${id}`, { method: "DELETE" }) },
    orderStatuses: { list: () => request<RefItem[]>("/ref/order-statuses"), create: (d: { name: string }) => request<RefItem>("/ref/order-statuses", { method: "POST", body: JSON.stringify(d) }), update: (id: number, d: { name: string }) => request<RefItem>(`/ref/order-statuses/${id}`, { method: "PATCH", body: JSON.stringify(d) }), delete: (id: number) => request(`/ref/order-statuses/${id}`, { method: "DELETE" }) },
    priorities: { list: () => request<RefItem[]>("/ref/priorities"), create: (d: { name: string }) => request<RefItem>("/ref/priorities", { method: "POST", body: JSON.stringify(d) }), update: (id: number, d: { name: string }) => request<RefItem>(`/ref/priorities/${id}`, { method: "PATCH", body: JSON.stringify(d) }), delete: (id: number) => request(`/ref/priorities/${id}`, { method: "DELETE" }) },
    countries: { list: () => request<CountryItem[]>("/ref/countries"), create: (d: { name: string }) => request<CountryItem>("/ref/countries", { method: "POST", body: JSON.stringify(d) }) },
    manufacturers: { 
      list: () => request<ManufacturerItem[]>("/ref/manufacturers"), 
      get: (id: number) => request<ManufacturerItem>(`/ref/manufacturers/${id}`),
      create: (d: { name: string; description?: string; country_id?: number; image_url?: string; catalog_pdf_url?: string }) => request<ManufacturerItem>("/ref/manufacturers", { method: "POST", body: JSON.stringify(d) }),
      update: (id: number, d: { name?: string; description?: string; country_id?: number; image_url?: string; catalog_pdf_url?: string | null }) => request<ManufacturerItem>(`/ref/manufacturers/${id}`, { method: "PATCH", body: JSON.stringify(d) }), 
      delete: (id: number) => request(`/ref/manufacturers/${id}`, { method: "DELETE" }) 
    },
    features: { 
      list: () => request<FeatureItem[]>("/ref/features"), 
      get: (id: number) => request<FeatureItem>(`/ref/features/${id}`),
      create: (d: { name: string; icon_url?: string; color?: string; colors?: string[] }) => request<FeatureItem>("/ref/features", { method: "POST", body: JSON.stringify(d) }), 
      update: (id: number, d: { name?: string; icon_url?: string; color?: string; colors?: string[] }) => request<FeatureItem>(`/ref/features/${id}`, { method: "PATCH", body: JSON.stringify(d) }), 
      delete: (id: number) => request(`/ref/features/${id}`, { method: "DELETE" }) 
    },
    coefficients: {
      list: () => request<RefItem[]>("/ref/coefficients"),
      create: (d: { name: string }) => request<RefItem>("/ref/coefficients", { method: "POST", body: JSON.stringify(d) }),
      delete: (id: number) => request(`/ref/coefficients/${id}`, { method: "DELETE" }),
    },
    colors: {
      list: () => request<RefItem[]>("/ref/colors"),
      get: (id: number) => request<RefItem>(`/ref/colors/${id}`),
      create: (d: { name: string }) => request<RefItem>("/ref/colors", { method: "POST", body: JSON.stringify(d) }),
      update: (id: number, d: { name: string }) => request<RefItem>(`/ref/colors/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
      delete: (id: number) => request(`/ref/colors/${id}`, { method: "DELETE" }),
    },
    pricelistGroups: {
      list: () => request<PricelistGroupItem[]>("/ref/pricelist-groups"),
      get: (id: number) => request<PricelistGroupItem>(`/ref/pricelist-groups/${id}`),
      create: (d: { name: string; sort_index?: number; display_properties_in_list?: boolean }) => request<PricelistGroupItem>("/ref/pricelist-groups", { method: "POST", body: JSON.stringify(d) }),
      update: (id: number, d: { name?: string; sort_index?: number; display_properties_in_list?: boolean }) => request<PricelistGroupItem>(`/ref/pricelist-groups/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
      delete: (id: number) => request(`/ref/pricelist-groups/${id}`, { method: "DELETE" }),
    },
    pricelist: {
      create: (d: { manufacturer_id: number; lens_name: string; description?: string; full_description?: string; barcode?: string; barcodes?: { code: string; price?: number; description?: string }[]; photo_url?: string; photo_urls?: string[]; sph?: string; cyl?: string; step?: string; diameters?: string; price: number; is_promo?: boolean; uv_protection?: boolean; material?: string | null; lens_id?: number; group: string; coefficient?: string; feature_ids?: number[]; feature_colors?: Record<string, string[]>; custom_values?: Record<string, string | string[] | boolean | null> }) =>
        request<PricelistItemResponse>("/ref/pricelist", { method: "POST", body: JSON.stringify(d) }),
      bulkCreate: (items: any[]) =>
        request<PricelistItemResponse[]>("/ref/pricelist/bulk", { method: "POST", body: JSON.stringify({ items }) }),
      update: (id: number, d: { manufacturer_id?: number; lens_name?: string; description?: string; full_description?: string; barcode?: string; barcodes?: { code: string; price?: number; description?: string }[]; photo_url?: string; photo_urls?: string[]; sph?: string; cyl?: string; step?: string; diameters?: string; price?: number; is_promo?: boolean; uv_protection?: boolean; material?: string | null; lens_id?: number; group?: string; coefficient?: string; feature_ids?: number[]; feature_colors?: Record<string, string[]>; custom_values?: Record<string, string | string[] | boolean | null> }) =>
        request<PricelistItemResponse>(`/ref/pricelist/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
      delete: (id: number) => request(`/ref/pricelist/${id}`, { method: "DELETE" }),
    },
    customFields: {
      list: () => request<CustomFieldItem[]>("/ref/custom-fields"),
      listAll: () => request<CustomFieldItem[]>("/ref/custom-fields/all"),
      create: (d: { code?: string; label: string; field_type: "string" | "select" | "multi_select" | "checkbox" | "reference"; is_required?: boolean; is_active?: boolean; sort_index?: number }) =>
        request<CustomFieldItem>("/ref/custom-fields", { method: "POST", body: JSON.stringify(d) }),
      update: (id: number, d: Partial<{ code: string; label: string; field_type: "string" | "select" | "multi_select" | "checkbox" | "reference"; is_required: boolean; is_active: boolean; sort_index: number }>) =>
        request<CustomFieldItem>(`/ref/custom-fields/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
      delete: (id: number) => request(`/ref/custom-fields/${id}`, { method: "DELETE" }),
      addOption: (fieldId: number, d: { value: string; sort_index?: number; is_active?: boolean }) =>
        request<CustomFieldOptionItem>(`/ref/custom-fields/${fieldId}/options`, { method: "POST", body: JSON.stringify(d) }),
      updateOption: (fieldId: number, optionId: number, d: Partial<{ value: string; sort_index: number; is_active: boolean }>) =>
        request<CustomFieldOptionItem>(`/ref/custom-fields/${fieldId}/options/${optionId}`, { method: "PATCH", body: JSON.stringify(d) }),
      deleteOption: (fieldId: number, optionId: number) => request(`/ref/custom-fields/${fieldId}/options/${optionId}`, { method: "DELETE" }),
    },
    products: { list: () => request<ProductRefItem[]>("/ref/products"), create: (d: { name: string; code?: string }) => request<ProductRefItem>("/ref/products", { method: "POST", body: JSON.stringify(d) }), update: (id: number, d: { name?: string; code?: string }) => request<ProductRefItem>(`/ref/products/${id}`, { method: "PATCH", body: JSON.stringify(d) }), delete: (id: number) => request(`/ref/products/${id}`, { method: "DELETE" }) },
    productCharacteristics: {
      list: (productId?: number) => request<ProductCharItem[]>(`/ref/product-characteristics${productId != null ? `?product_id=${productId}` : ""}`),
      create: (d: { product_id: number; name: string }) => request<ProductCharItem>("/ref/product-characteristics", { method: "POST", body: JSON.stringify(d) }),
      update: (id: number, d: { name: string }) => request<ProductCharItem>(`/ref/product-characteristics/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
      delete: (id: number) => request(`/ref/product-characteristics/${id}`, { method: "DELETE" }),
    },
  },
  chat: {
    users: (search?: string) =>
      request<ChatUserShortResponse[]>(
        "/chat/users" + (search ? `?search=${encodeURIComponent(search)}` : ""),
      ),
    general: {
      messages: (afterId?: number, limit: number = 50) => {
        const params = new URLSearchParams();
        if (afterId != null) params.set("after_id", String(afterId));
        params.set("limit", String(limit));
        return request<ChatMessageItem[]>(`/chat/general/messages?${params.toString()}`);
      },
      send: (text: string | null, files: File[], replyToMessageId?: number | null) => {
        const fd = new FormData();
        if (text != null) fd.append("text", text);
        if (replyToMessageId != null) fd.append("reply_to_message_id", String(replyToMessageId));
        files.forEach((f) => fd.append("files", f));
        return requestMultipart<ChatMessageItem>("/chat/general/messages", fd);
      },
      leave: () => request<void>("/chat/general/leave", { method: "POST" }),
      join: () => request<void>("/chat/general/join", { method: "POST" }),
    },
    privateDialogs: {
      list: () => request<PrivateDialogItem[]>("/chat/private/dialogs"),
      ensure: (userId: number) => request<{ id: number }>(`/chat/private/dialogs/${userId}`, { method: "POST" }),
      messages: (dialogId: number, afterId?: number, limit: number = 50) =>
        (() => {
          const params = new URLSearchParams();
          if (afterId != null) params.set("after_id", String(afterId));
          params.set("limit", String(limit));
          return request<ChatMessageItem[]>(`/chat/private/dialogs/${dialogId}/messages?${params.toString()}`);
        })(),
      send: (dialogId: number, text: string | null, files: File[], replyToMessageId?: number | null) => {
        const fd = new FormData();
        if (text != null) fd.append("text", text);
        if (replyToMessageId != null) fd.append("reply_to_message_id", String(replyToMessageId));
        files.forEach((f) => fd.append("files", f));
        return requestMultipart<ChatMessageItem>(`/chat/private/dialogs/${dialogId}/messages`, fd);
      },
    },
    groupDialogs: {
      list: () => request<GroupDialogItem[]>("/chat/group/dialogs"),
      create: (data: { name: string; member_ids?: number[] }) =>
        request<GroupDialogItem>("/chat/group/dialogs", {
          method: "POST",
          body: JSON.stringify({ name: data.name, member_ids: data.member_ids ?? [] }),
        }),
      addMember: (dialogId: number, userId: number) =>
        request<void>(`/chat/group/dialogs/${dialogId}/members/${userId}`, { method: "POST" }),
      removeMember: (dialogId: number, userId: number) =>
        request<void>(`/chat/group/dialogs/${dialogId}/members/${userId}`, { method: "DELETE" }),
      members: (dialogId: number) => request<GroupMemberItem[]>(`/chat/group/dialogs/${dialogId}/members`),
      messages: (dialogId: number, afterId?: number, limit: number = 50) => {
        const params = new URLSearchParams();
        if (afterId != null) params.set("after_id", String(afterId));
        params.set("limit", String(limit));
        return request<ChatMessageItem[]>(`/chat/group/dialogs/${dialogId}/messages?${params.toString()}`);
      },
      send: (dialogId: number, text: string | null, files: File[], replyToMessageId?: number | null) => {
        const fd = new FormData();
        if (text != null) fd.append("text", text);
        if (replyToMessageId != null) fd.append("reply_to_message_id", String(replyToMessageId));
        files.forEach((f) => fd.append("files", f));
        return requestMultipart<ChatMessageItem>(`/chat/group/dialogs/${dialogId}/messages`, fd);
      },
    },
    editMessage: (messageId: number, text: string | null) =>
      request<ChatMessageItem>(`/chat/messages/${messageId}`, { method: "PATCH", body: JSON.stringify({ text }) }),
    deleteMessage: (messageId: number) => request<void>(`/chat/messages/${messageId}`, { method: "DELETE" }),
    markMessagesRead: (messageIds: number[]) =>
      request<void>("/chat/messages/mark-read", { method: "POST", body: JSON.stringify(messageIds) }),
    notificationsSummary: () =>
      request<ChatNotificationSummary>("/chat/notifications/summary"),
  },
};
