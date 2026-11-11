# Project History & Updates

This log tracks the evolution of the e-commerce platform and major feature releases.

## 🕒 Development Timeline

### November 11, 2026: The "Standalone SuperAdmin & Dokani Theme" Era
- **SuperAdmin Separation**: Extracted SuperAdmin into an independent, dedicated project at `../whatsapp-commerce-superadmin` running on port 5174. Connects seamlessly to the backend API (`/api/superadmin/*`) on port 8787 for live Neon PostgreSQL read and update operations.
- **Dokani Dark Theme**: Restyled the entire storefront, merchant dashboard, and superadmin using the requested CSS color palette (`#c5efcb`, `#1f241f`, `#3c433b`, `#020402`, etc.) with solid matte surfaces, crisp borders, and inline sparkline analytics.
- **SEO & Google Discoverability**: Injected dynamic per-store Open Graph, meta tags, and JSON-LD schema alongside dynamic `/sitemap.xml` and `/robots.txt`.
- **Platform Announcements**: Implemented superadmin broadcast banner displayed to merchants and customers.

### March 7, 2026: The "Admin & Storage" Era
- **Core Feature**: Launched the **Admin Dashboard**. Store owners can now manage products, categories, and business settings without code.
- **Core Feature**: Integrated **Supabase Auth**. Secured admin routes using protected layouts and role-based policies.
- **Core Feature**: Integrated **Supabase Storage**. Enabled direct file uploads for product images, logos, and hero banners.
- **Update**: **Removed manual image URL inputs** across the entire admin dashboard to enforce the use of secure, direct uploads.
- **UI/UX**: Added a **Mobile Navigation Bar** for admins to manage the store on the go.
- **UI/UX**: Added "View Store" shortcuts for seamless transition between admin and customer views.

### March 4, 2026: The Foundation
- **Core Feature**: Initial launch of the **Dynamic Storefront**.
- **Core Feature**: **WhatsApp Checkout** integration for low-friction ordering.
- **Core Feature**: Real-time product catalog synced with **Supabase Database**.
- **UI/UX**: Responsive grid system with Tailwind CSS and premium Lucide icons.

---

## 🚀 Incoming Updates
- [ ] User Role Management (Multiple admin accounts)
- [ ] Order Status Tracking (Pending, Shipped, Delivered)
- [ ] Automated Sales Reports
- [ ] Multi-currency support
