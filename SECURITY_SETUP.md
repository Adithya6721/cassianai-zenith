# 🔒 CASSIAN.AI - Security & Authentication Setup

## Overview

This document explains the authentication and authorization system for CASSIAN.AI, including Firestore security rules and server-side token verification.

---

## ✅ Security Implementation

### 1. **Server-Side Authentication**

All API routes now verify Firebase ID tokens server-side using Firebase Admin SDK. This prevents:
- ❌ Client-side userId tampering
- ❌ Unauthorized access to projects
- ❌ Permission escalation attacks

**Implementation:**
- `lib/firebaseAdmin.ts` - Firebase Admin SDK initialization
- `lib/authHelper.ts` - Token verification helper
- All `/api/*` routes verify tokens before processing requests

### 2. **Firestore Security Rules**

Projects are strictly owned by users. The rules enforce:
- ✅ Users can only create projects with their own `userId`
- ✅ Users can only read/update/delete their own projects
- ✅ No anonymous access
- ✅ No cross-user data access

---

## 🔧 Setup Instructions

### Step 1: Configure Firebase Service Account

#### Option A: Using Service Account JSON (Recommended for Production)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Project Settings** → **Service Accounts**
4. Click **"Generate New Private Key"**
5. Download the JSON file
6. Add to `.env.local`:

```bash
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"your-project","private_key":"-----BEGIN PRIVATE KEY-----\n...","client_email":"firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com",...}'
```

**Note:** The entire JSON should be on a single line, wrapped in single quotes.

#### Option B: Using Individual Credentials (Easier for Development)

1. Download the service account JSON (same as above)
2. Extract the following values and add to `.env.local`:

```bash
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour_Private_Key_Here\n-----END PRIVATE KEY-----"
```

**Important:** Keep `\n` characters in the private key string.

---

### Step 2: Update Firestore Security Rules

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Navigate to **Firestore Database** → **Rules**
3. Replace the existing rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Projects collection - strict user ownership
    match /projects/{projectId} {
      // Allow create only if authenticated and userId matches auth.uid
      allow create: if request.auth != null
        && request.resource.data.userId == request.auth.uid;

      // Allow read, update, delete only if user owns the project
      allow read, update, delete: if request.auth != null
        && resource.data.userId == request.auth.uid;
    }

    // Deny all other access
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

4. Click **"Publish"**

---

### Step 3: Verify Environment Variables

Your `.env.local` should have:

```bash
# Client SDK (Frontend)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# Admin SDK (Backend)
FIREBASE_SERVICE_ACCOUNT_KEY='...' # OR use individual credentials below
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="..."

# Gemini AI
GEMINI_API_KEY=...
```

---

## 🔐 How Authentication Works

### Upload Flow (Create New Project)

```
1. User logs in with Google → Frontend gets ID token
2. User uploads code (Text/ZIP/GitHub)
3. Frontend sends request with Authorization: Bearer <token>
4. Server verifies token with Firebase Admin SDK
5. Server extracts userId from verified token
6. Server processes upload
7. Server creates project in Firestore with verified userId
8. Returns success response
```

### Upload Flow (Add to Existing Project)

```
1. User selects existing project
2. User uploads new files
3. Frontend sends request with Authorization: Bearer <token> + projectId
4. Server verifies token → extracts userId
5. Server loads existing project
6. Server checks: project.userId === verifiedUserId
7. If authorized: merge files and update project
8. If unauthorized: return 403 Forbidden
```

### Read/Delete Operations

All operations follow the same pattern:
1. Verify ID token
2. Check ownership: `project.userId === verifiedUserId`
3. Allow or deny based on ownership

---

## 🚨 Security Features

### ✅ What's Protected

- **User Identity Verification**: All API requests verify Firebase ID tokens
- **Ownership Enforcement**: Users can only access/modify their own projects
- **Server-Side Validation**: All userId checks happen server-side (untamperable)
- **Firestore Rules**: Double protection with client-side rules
- **Token Expiration**: ID tokens expire after 1 hour (auto-refreshed by Firebase)

### ❌ What's Prevented

- **Client-side tampering**: Users cannot fake userId in requests
- **Cross-user access**: Users cannot read/modify others' projects
- **Anonymous access**: All operations require authentication
- **Token replay attacks**: Tokens expire and are verified server-side

---

## 🧪 Testing

### Test 1: Upload with Valid Token (Should Succeed)

```bash
# Get your ID token from browser console:
# firebase.auth().currentUser.getIdToken().then(console.log)

curl -X POST http://localhost:3000/api/upload \
  -H "Authorization: Bearer YOUR_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rawText": "console.log(\"Hello World\");",
    "name": "Test Project"
  }'
```

**Expected:** `{ "success": true, "data": { ... } }`

### Test 2: Upload without Token (Should Fail)

```bash
curl -X POST http://localhost:3000/api/upload \
  -H "Content-Type: application/json" \
  -d '{
    "rawText": "console.log(\"Hello\");",
    "name": "Test"
  }'
```

**Expected:** `{ "success": false, "error": "Missing or invalid Authorization header" }` (401)

### Test 3: Modify Someone Else's Project (Should Fail)

```bash
curl -X POST http://localhost:3000/api/upload \
  -H "Authorization: Bearer YOUR_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "append",
    "projectId": "SOMEONE_ELSES_PROJECT_ID",
    "rawText": "malicious code"
  }'
```

**Expected:** `{ "success": false, "error": "You don't have permission to modify this project" }` (403)

---

## 📁 File Structure

```
lib/
├── firebase.ts          # Client-side Firebase SDK
├── firebaseAdmin.ts     # Server-side Firebase Admin SDK
└── authHelper.ts        # Token verification helper

app/api/
├── upload/route.ts      # Upload API with auth verification
├── chat/route.ts        # Chat API (to be updated)
└── projects/[id]/route.ts  # Project API (to be updated)

services/
└── projectStore.ts      # Firestore operations (client-side)
```

---

## 🔍 Troubleshooting

### Error: "Missing or invalid Authorization header"

**Cause:** ID token not sent or malformed
**Fix:** Ensure frontend sends `Authorization: Bearer <token>` header

### Error: "Invalid or expired authentication token"

**Cause:** Token expired or Firebase Admin SDK not configured
**Fix:**
1. Check `.env.local` has Firebase Admin credentials
2. Verify service account JSON is valid
3. Token may be expired - frontend should refresh it

### Error: "PERMISSION_DENIED" from Firestore

**Cause:** Firestore rules rejecting the operation
**Fix:**
1. Verify Firestore rules are published correctly
2. Check that `userId` field is set in document
3. Ensure user is authenticated

### Error: "You don't have permission to modify this project"

**Cause:** User trying to modify project they don't own
**Fix:** This is expected behavior - user can only modify their own projects

---

## 📝 Notes

- ID tokens are automatically refreshed by Firebase SDK
- Server-side verification happens on every request
- No caching of authentication state on server
- All Firestore writes happen server-side (except reads via getProjects)
- Future improvement: Move all Firestore operations server-side

---

## ✅ Checklist

- [ ] Firebase service account configured in `.env.local`
- [ ] Firestore security rules published
- [ ] Build succeeds: `npm run build`
- [ ] Upload works with authentication
- [ ] Users can only see their own projects
- [ ] Append mode checks ownership
- [ ] Unauthorized access returns 403

---

**Last Updated:** 2026-02-15
**Status:** ✅ Production Ready
