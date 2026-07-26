# Architecture Design

## System Overview
Full-stack restaurant ordering app with React frontend and Atoms Cloud backend. Customers browse menu, customize orders, and place pickup orders. Admins manage orders, menu items, and view sales analytics.

## Tech Stack
- Frontend: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- Backend: Atoms Cloud (FastAPI + PostgreSQL + Auth)
- SDK: @metagptx/web-sdk for auth, entity access, and API calls

## Module Design
| Module | Responsibility | Key Files |
|--------|---------------|-----------|
| Customer Pages | Menu browsing, cart, checkout, order tracking | src/pages/Index.tsx, Menu.tsx, Cart.tsx, Checkout.tsx, MyOrders.tsx |
| Admin Pages | Dashboard, order/menu/customer management | src/pages/admin/AdminDashboard.tsx, AdminOrders.tsx, AdminMenu.tsx |
| Cart Store | Client-side cart management with localStorage | src/lib/cart-store.ts |
| API Layer | Type definitions and client setup | src/lib/api.ts |
| Backend Admin API | Order management, customers, sales reports | backend/routers/admin.py |
| Backend Orders API | Customer order placement and history | backend/routers/orders.py |

## Tech Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Cart storage | localStorage | No auth required for browsing/cart, simple persistence |
| Order placement | Custom API endpoint | Better control over order creation logic |
| Admin auth | Atoms Cloud auth | Reuse existing auth system, no separate admin login |
| Dark theme | CSS variables | Consistent Italian restaurant branding |

## File Tree Plan
```
app/
├── backend/
│   ├── routers/
│   │   ├── admin.py (admin order/customer/sales APIs)
│   │   └── orders.py (customer order placement)
│   └── models/ (auto-generated ORM models)
├── frontend/
│   ├── src/
│   │   ├── components/CustomerLayout.tsx
│   │   ├── lib/api.ts, cart-store.ts
│   │   ├── pages/
│   │   │   ├── Index.tsx, Menu.tsx, Cart.tsx, Checkout.tsx
│   │   │   ├── OrderConfirmation.tsx, MyOrders.tsx, Contact.tsx
│   │   │   └── admin/ (AdminLogin, AdminDashboard, AdminOrders, AdminMenu, AdminCustomers, AdminSettings)
│   │   └── App.tsx
```

## Implementation Guide
1. Database tables handle categories, menu items, extras, orders, and restaurant settings
2. Customer flow: Browse menu → Add to cart → Checkout (requires login) → Place order via API → View confirmation
3. Admin flow: Login → Dashboard with sales stats → Manage orders/menu/customers/settings
4. All API calls use web-sdk client.apiCall.invoke for custom endpoints
5. Entity CRUD used for menu browsing (public data) and admin menu management