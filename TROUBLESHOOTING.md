# Prompt Olympics - Troubleshooting Guide

## The Issue: "Your story did not load"

This error appears when the app cannot generate a story. There are two possible causes:

### 1. **Gemini API is not configured** (Most Common)
The server doesn't have a valid `GEMINI_API_KEY` environment variable set.

**Solution**: See [GEMINI_SETUP.md](./GEMINI_SETUP.md)

### 2. **Gemini API is rate-limited or down**
Your API account has exceeded its usage quota or Google's servers are temporarily unavailable.

**Solution**: Wait a few hours and try again, or upgrade your Google Cloud account.

---

## Quick Start: Local Setup with Gemini

### Prerequisites
- Node.js 18 or later
- A Google Gemini API key (free at [Google AI Studio](https://aistudio.google.com/app/apikey))

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Build the App
```bash
npm run build
```

### Step 3: Run with Your API Key
Replace `YOUR_API_KEY_HERE` with your actual key:

**Windows PowerShell:**
```powershell
$env:GEMINI_API_KEY="YOUR_API_KEY_HERE"
npm start
```

**Linux/Mac:**
```bash
export GEMINI_API_KEY="YOUR_API_KEY_HERE"
npm start
```

### Step 4: Open in Browser
Visit `http://localhost:10000` and test story generation.

---

## Alternative: Local-Only Mode (No Gemini)

If you don't have a Gemini API key, the app includes a complete local story generation system (see `src/storyGeneration.ts`).

**To enable this, you would need to**:
1. Port `storyGeneration.ts` functions to the server (convert to JavaScript/TypeScript in `server.js`)
2. Modify `/api/generate-story` to use `generateStory()` instead of calling Gemini
3. Rebuild and restart

This is a development project task - if you want this feature, the code structure already supports it!

---

## Testing Your Setup

### Test 1: Check Server Health
```powershell
Invoke-WebRequest -Uri "http://localhost:10000/api/health" -UseBasicParsing | Select-Object -ExpandProperty Content
```

Expected output (with API key):
```json
{"ok":true,"geminiConfigured":true,"model":"gemini-pro"}
```

Expected output (without API key):
```json
{"ok":true,"geminiConfigured":false,"model":"gemini-pro"}
```

### Test 2: Test Gemini Connection
```powershell
$body = @{ prompt = "Say hello" } | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:10000/api/test-gemini" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing | Select-Object -ExpandProperty Content
```

Expected: A JSON response with a `text` field containing Gemini's response.

### Test 3: Test Story Generation
```powershell
$body = @{
  prompt = "A robot tries to cook dinner"
  theme = "Robot at Dinner"
} | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:10000/api/generate-story" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing | Select-Object -ExpandProperty Content
```

Expected: A JSON response with a `text` field containing the generated story.

---

## Common Errors & Solutions

### ❌ "Gemini is not configured on the server"
- **Cause**: `GEMINI_API_KEY` environment variable not set
- **Fix**: Set it before running `npm start` (see Step 3 above)

### ❌ "Gemini rejected the API key"
- **Cause**: Invalid or expired API key
- **Fix**: Create a new key at [Google AI Studio](https://aistudio.google.com/app/apikey)

### ❌ "Gemini model 'X' was not found"
- **Cause**: The model is not available or your key lacks access
- **Fix**: Try a different model or verify your API key works at [Google AI Studio](https://aistudio.google.com/app/apikey)

### ❌ "Gemini is rate-limited"
- **Cause**: You've exceeded free tier limits
- **Fix**: Wait a few hours or upgrade to a paid Google Cloud account

### ❌ "Cannot find package '@google/genai'"
- **Cause**: Dependencies not installed
- **Fix**: Run `npm install`

### ❌ Server starts but won't listen on port 10000
- **Cause**: Port 10000 is already in use
- **Fix**: Kill the old process or set a different port:
  ```powershell
  $env:PORT=3000
  npm start
  ```
  Then visit `http://localhost:3000`

---

## Architecture

### How It Works

1. **User writes a prompt** in the browser (React UI)
2. **Frontend sends** prompt + theme to `/api/generate-story`
3. **Backend (Node.js)** calls Google Gemini API with the prompt
4. **Gemini** generates a story and returns it
5. **Frontend receives** the story and scores it locally
6. **Story is displayed** with AI judge's verdict

### Why Gemini on the Backend?

- ✅ API key stays private (never exposed to browsers)
- ✅ Stories are consistent across all users
- ✅ Can moderate content server-side before showing users
- ✅ Can implement rate limiting and usage tracking

---

## Development Notes

### Story Generation Pipeline (in `src/storyGeneration.ts`)

The app includes a sophisticated local story generation system:
- `extractPremise()` - Parses user prompt into structured data
- `generateOutline()` - Creates 7-part story structure
- `generateStoryFromOutline()` - Assembles into prose
- `evaluateStoryQuality()` - Scores on 8 dimensions
- `generateStory()` - Full pipeline with multi-attempt fallback

This could be ported to the server to create a Gemini-free version.

### Story Scoring (in `src/storyGeneration.ts` and `src/main.tsx`)

- `scoreOtherStory()` - Evaluates stories for the Judge interface
- `promptAnalysis()` - Scores prompt quality (100-point scale)
- `buildStory()` - Combines all metrics into final AI verdict

---

## Getting Help

1. **Gemini API Issues**: Check [Google AI Documentation](https://ai.google.dev/)
2. **Project Setup**: See [README.md](./README.md)
3. **Gemini Configuration**: See [GEMINI_SETUP.md](./GEMINI_SETUP.md)
4. **Code Documentation**: Check inline comments in `server.js` and `src/`
