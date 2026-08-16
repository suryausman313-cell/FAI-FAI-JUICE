Total 7 files change karni hain.

Backend — 5 files:

app/backend/models/orders.py
app/backend/services/database.py
app/backend/routers/kitchen_orders.py
app/backend/routers/rider.py
app/backend/routers/admin.py

Frontend — 2 files:

app/frontend/src/pages/admin/KitchenOrders.tsx
app/frontend/src/pages/admin/AdminSales.tsx

Pehle backend ki 5 files upload karo → Render Live hone do.
Phir frontend ki 2 files upload karo → Cloudflare Success hone do.

Android Kitchen app mein is V7 ke liye koi nayi file change nahi karni, agar pehle wali ring-stop Android files already dali hui hain.

ya karna sa kia change hoga shoart ma bata do

Short ma:

Kitchen screen Talabat jaisi
Refresh icon hide, auto refresh background ma chalta rahega
Timer selected time se chalega
Time khatam → red -1, -2, -3 min
X min late show hoga
Ek dafa voice: “Order number X is late”
Today / Yesterday ma total orders + total sale AED
Admin ko pata chalega:
kitchen kitna min early/late
rider delivery kitna min early/late
total order se delivery tak kitna time laga.
abhi kitchen app open he ni ho rahe ha black dehk raha ha sab q

Black screen ka matlab latest KitchenOrders file me frontend crash ho raha hai. Android app ka issue lag nahi raha.

Abhi sabse safe kaam:

V7 wali KitchenOrders file hatao aur last working file wapas paste karo:

Working KitchenOrders file

Path:

app/frontend/src/pages/admin/KitchenOrders.tsx

Isko paste karke Cloudflare deploy hone do. Kitchen app wapas open ho jana chahiye.
