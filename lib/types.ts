export type Region = "NO" | "SO" | "WE";
export type Section =
  | "cockpit"
  | "marketing"
  | "market"
  | "inventory"
  | "purchasing"
  | "production";
export type Point = {
  day: number;
  value: number | null;
  provisional?: boolean;
  interpolated?: boolean;
};
export type Product = {
  id: string;
  name: string;
  size: string;
  unit: string;
  currency: string;
};
export type Sale = {
  id: string;
  day: number;
  product: string;
  region: Region;
  channel: string;
  quantity: number;
  revenue: number;
  cost: number | null;
  provisional?: boolean;
};
export type Market = {
  product: string;
  region: Region;
  channel: string;
  from: number;
  to: number;
  quantity: number;
  value: number;
  currency: string;
  unit: string;
};
export type Budget = { product: string; region: Region; amount: number };
export type Price = {
  product: string;
  channel: string;
  amount: number;
  currency: string;
};
export type Inventory = {
  product: string;
  category: string;
  location: string;
  stock: number;
  reserved: number | null;
  unit: string;
  history: { day: number; stock: number }[];
};
export type Incoming = {
  id: string;
  product: string;
  quantity: number;
  unit: string;
  due: number | null;
  type: "Einkauf" | "Produktion";
  status: string;
};
export type CashPeriod = {
  id: string;
  start: number;
  end: number;
  customers: number;
  vendors: number;
  marketing: number;
  overhead: number;
  interest: number;
  closing: number;
};
export type Production = {
  id: string;
  product: string;
  start: number;
  end: number | null;
  target: number;
  confirmed: number;
  status: string;
};
export type Offer = {
  material: string;
  description: string;
  vendor: string;
  vendorName: string;
  price: number;
  unit: string;
  currency: string;
  location: string;
  leadDays: number | null;
};
export type Account = {
  id: string;
  name: string;
  amount: number;
  children?: Account[];
};
export type Source = {
  name: string;
  state: "ok" | "error" | "missing";
  at: string | null;
  period: string;
  detail?: string;
};
export type Capability = {
  key: string;
  label: string;
  verified: boolean;
  reason: string;
};
export type Snapshot = {
  mode: "live";
  game: string;
  company: string;
  roundDays: number;
  currentDay: number;
  version: string;
  products: Product[];
  sales: Sale[];
  completedDays: number[];
  market: Market[];
  budgets: Budget[];
  prices: Price[];
  inventory: Inventory[];
  incoming: Incoming[];
  cash: CashPeriod[];
  production: Production[];
  offers: Offer[];
  capacities: {
    category: string;
    used: number;
    capacity: number;
    unit: string;
  }[];
  finances: {
    period: string;
    currency: string;
    balance: Account[];
    income: Account[];
    movements: {
      id: string;
      day: number;
      account: string;
      amount: number;
      description: string;
      closing: boolean | null;
    }[];
  };
  sources: Source[];
  capabilities: Capability[];
  financialHistory?: Snapshot["finances"][];
};
export type PurchaseLine = {
  material: string;
  vendor: string;
  quantity: number;
  unit: string;
  location: string;
};
