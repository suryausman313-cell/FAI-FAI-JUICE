# Fai Fai Juice ko free live deploy karna

## System

- Frontend: Cloudflare Pages free
- Backend: Render free web service
- Database: Neon PostgreSQL free
- Customer login: mobile number + 4-digit PIN, 90 din tak saved session
- Menu/offer/deal pictures: Upload button se; Cloudinary optional hai

## 1. GitHub

1. ZIP extract karein.
2. GitHub par repository banayein, misal: `fai-fai-juice`.
3. Project ke tamam folders upload karein.
4. Asli `.env` file upload na karein; sirf `.env.example` rehne dein.

## 2. Neon database

1. Neon par free Project banayein.
2. Connection string copy karein (`postgresql://...`).
3. Purana live database rakhna ho to usi database ka `DATABASE_URL` use karein. Is se existing menu, orders aur customers delete nahi honge.

## 3. Render backend — Free

1. Render > New > Web Service.
2. GitHub repository connect karein.
3. Root Directory: `app/backend`
4. Build Command: `pip install -r requirements.txt`
5. Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Instance Type mein **Free** select karein. `render.yaml` bhi `plan: free` par set hai.
7. Environment mein ye values zaroor add karein:

   - `DATABASE_URL` = Neon connection string
   - `JWT_SECRET_KEY` = kam az kam 32 random characters
   - `CUSTOMER_JWT_SECRET` = doosra, alag 32+ character random secret
   - `FAI_FAI_SETTINGS_KEY` = customer PIN reset/settings ke liye alag strong key
   - `INITIAL_ADMIN_USERNAME` = apna naya admin username
   - `INITIAL_ADMIN_PASSWORD` = apna strong admin password
   - `KITCHEN_PIN` = naya 4–8 digit PIN; `1122` use na karein
   - `ALLOWED_ORIGINS` = `https://fai-fai-juice.pages.dev`
   - `PYTHON_BACKEND_URL` = Render ka live backend URL
   - `MGX_IGNORE_INIT_DATA` = `1`

8. Deploy karein aur backend URL note karein.

`INITIAL_ADMIN_USERNAME` aur `INITIAL_ADMIN_PASSWORD` sirf bilkul naye database par pehla Super Admin banate hain. Agar database mein Admin pehle se hai to Admin > Accounts/Security se password change karein.

## 4. Cloudflare Pages frontend

1. Cloudflare > Workers & Pages > Create > Pages > Connect to Git.
2. GitHub repository choose karein.
3. Root Directory: `app/frontend`
4. Framework preset: Vite
5. Build command: `npm ci && npm run build`
6. Build output: `dist`
7. Environment variables:

   - `VITE_API_BASE_URL` = Render backend URL
   - `VITE_SITE_URL` = `https://fai-fai-juice.pages.dev`

8. Production deploy karein. Customer ko hamesha `https://fai-fai-juice.pages.dev` dein. Hash wala `8756cec8...pages.dev` sirf preview deployment hai.

## Optional: pictures ke liye Cloudinary

Cloudinary ke baghair bhi Upload Image ka button photo compress karke database mein save karega. Zyada menu photos hon to Cloudflare Pages mein ye optional variables add karein:

- `VITE_CLOUDINARY_CLOUD_NAME`
- `VITE_CLOUDINARY_UPLOAD_PRESET`

## Login behavior

- Bilkul naye mobile par pehle Sign Up khulega.
- Sign Up ke baad app dobara kholne par login nahi maangega.
- Logout ya app/browser data delete karne ke baad registered mobile pehle se bhara hoga; customer sirf PIN dalega.
- Naya mobile number ho to Sign Up lazmi hai.
- Customer bottom menu ke Account button se Logout ya Change PIN kar sakta hai.

## Important

- Render free backend idle hone par sleep kar sakta hai; pehli request 30–60 seconds late ho sakti hai.
- Menu mein item add/edit/delete, price, size aur picture upload sab available rahenge.
- `CUSTOMER_JWT_SECRET`, Admin password aur Kitchen PIN kabhi GitHub mein na likhein.
- Production deploy se pehle Admin, Kitchen, customer signup/login, menu image upload aur ek test order zaroor check karein.
