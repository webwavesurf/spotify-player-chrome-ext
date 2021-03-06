import { uuidv4 } from "./utils/uuid.js"
import { CLIENT_ID } from "./utils/clientId.js"
import { sha256 } from "hash.js";
import { base64urlencode } from "./utils/hash.js";
// haibeacocpobdaiimnfhjbkiggfacehc
const REDIRECT_URI = "https://haibeacocpobdaiimnfhjbkiggfacehc.chromiumapp.org/";
const SCOPE = "user-read-playback-state user-modify-playback-state user-library-modify user-library-read";
let STATE = uuidv4();
let CODE_VERIFIER = uuidv4() + uuidv4();
let ACCESS_TOKEN = ""; // Access token to perform API reqeusts
let REFRESH_TOKEN = ""; // Used when access_token gets expired


chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.message === "login") {
    Login(sendResponse)
  }
  return true
})


async function Login(sendResponse) {

  STATE = uuidv4();
  CODE_VERIFIER = uuidv4() + uuidv4();

  // Save to storage (Because we need these when requesting access token for security reasons)
  chrome.storage.sync.set({ "state": STATE });
  chrome.storage.sync.set({ "codeVerifier": CODE_VERIFIER });

  // Hash CODE_VERIFIER using sha256 algo.
  const pkce_challenge_from_verifier = base64urlencode(sha256().update(CODE_VERIFIER).digest("base64"));

  const HASHED_CODE_VERIFIER = pkce_challenge_from_verifier;

  // Build request object
  const endpointObj = {
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPE,
    redirect_uri: REDIRECT_URI,
    state: STATE,
    code_challenge_method: "S256",
    code_challenge: HASHED_CODE_VERIFIER
  }

  // Stringify request object
  const endpointUrl = new URLSearchParams(endpointObj).toString();

  chrome.identity.launchWebAuthFlow({
    url: "https://accounts.spotify.com/authorize?" + endpointUrl,
    interactive: true
  }, function (redirect_url) {

    if (chrome.runtime.lastError) {
      return sendResponse({ message: "fail", description: chrome.runtime.lastError })
    }

    if (redirect_url.includes("error=access_denied")) {
      return sendResponse({ message: "fail", description: "Access denied." })
    }

    // Extract code and state from url
    const url = new URL(redirect_url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (state !== STATE) {
      return sendResponse({ message: "fail", description: "Failed to authenticate user, try again later." })
    }

    RequestAccessToken(code, sendResponse)
  })
}

// Now when we are logged in, we need to request access token to be able to use Spotify's enpoints
async function RequestAccessToken(code, sendResponse) {
  // Build data for token request
  const data = new URLSearchParams();
  data.append("code", code);
  data.append("redirect_uri", REDIRECT_URI);
  data.append("grant_type", "authorization_code");
  data.append("client_id", CLIENT_ID);
  data.append("code_verifier", CODE_VERIFIER);

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    body: data,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  })
  const resData = await res.json()

  // Save to global vars
  ACCESS_TOKEN = resData.access_token
  REFRESH_TOKEN = resData.refresh_token

  // Save tokens to storage (these acts almost like cookies so we dont need to login everytime we use the extension)
  chrome.storage.sync.set({ "ACCESS_TOKEN": ACCESS_TOKEN });
  chrome.storage.sync.set({ "REFRESH_TOKEN": REFRESH_TOKEN });

  // WE ARE IN, lets init the main app
  // await prepareInit(ACCESS_TOKEN, REFRESH_TOKEN);
  sendResponse({ message: "success", ACCESS_TOKEN, REFRESH_TOKEN })
}