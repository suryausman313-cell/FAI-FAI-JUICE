# Vita Napoli ko Atoms ke baghair free live karna

## System
- Frontend: Cloudflare Pages free
- Backend: Render free web service
- Database: Neon PostgreSQL free
- Online payment: band / zaroorat nahi

## 1. GitHub
1. ZIP extract karein.
2. GitHub par New repository banayein: `vita-napoli-app`.
3. Is project ke tamam folders upload karein.
4. `.env` file kabhi upload na karein. Sirf `.env.example` upload rehne dein.

## 2. Neon database
1. Neon par free account banayein.
2. New Project banayein.
3. Connection string copy karein.
4. Connection string `postgresql://...` se shuru hogi.

## 3. Render backend
1. Render > New > Web Service.
2. GitHub repository connect karein.
3. Root Directory: `app/backend`
4. Build Command: `pip install -r requirements.txt`
5. Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Free instance select karein.
7. Environment variables:
   - `DATABASE_URL` = Neon connection string
   - `JWT_SECRET_KEY` = koi lamba random password
   - `PYTHON_BACKEND_URL` = Render ka live backend URL
   - `MGX_IGNORE_INIT_DATA` = `1`
8. Deploy karein.
9. Backend URL note karein, example: `https://vita-napoli-backend.onrender.com`

## 4. Cloudflare Pages frontend
1. Cloudflare > Workers & Pages > Create > Pages > Connect to Git.
2. GitHub repository choose karein.
3. Root directory: `app/frontend`
4. Framework preset: Vite
5. Build command: `npm install && npm run build`
6. Build output: `dist`
7. Environment variable:
   - `VITE_API_BASE_URL` = Render backend URL
8. Deploy karein.

## 5. Login
Admin login is frontend local login:
- Username: `vitanapoli`
- Password: `admin2024`

Live karne ke baad foran Admin Settings mein username/password change karein.

## Important
- Render free backend idle hone par sleep kar sakta hai. Pehla order/open 30-60 seconds late ho sakta hai.
- Cloudflare frontend free aur fast rahega.
- Neon database free limit ke andar chalega.
- Image upload button free mode mein disabled hai. Admin menu mein image ka public URL paste karein.
- Purane Atoms orders/database is ZIP mein nahi hain; naya database empty start hoga.
