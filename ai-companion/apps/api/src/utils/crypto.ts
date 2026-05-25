const encoder = new TextEncoder();
const passwordHashPrefix = "pbkdf2-sha256";
const passwordHashIterations = 100_000;

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function equalBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a[index] ^ b[index];
  }

  return diff === 0;
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function importPasswordKey(password: string) {
  return crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits"
  ]);
}

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number) {
  const key = await importPasswordKey(password);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      iterations
    },
    key,
    256
  );

  return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(password, salt, passwordHashIterations);

  return [
    passwordHashPrefix,
    String(passwordHashIterations),
    toBase64Url(salt),
    toBase64Url(hash)
  ].join(":");
}

export async function verifyPassword(password: string, storedHash: string) {
  const [prefix, iterationsValue, saltValue, hashValue] = storedHash.split(":");
  const iterations = Number(iterationsValue);

  if (prefix !== passwordHashPrefix || !Number.isInteger(iterations) || !saltValue || !hashValue) {
    return false;
  }

  const salt = fromBase64Url(saltValue);
  const expectedHash = fromBase64Url(hashValue);
  const hash = await derivePasswordHash(password, salt, iterations);

  return equalBytes(hash, expectedHash);
}

async function importJwtKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign", "verify"]
  );
}

export async function signJwt(userId: string, secret: string) {
  const header = toBase64Url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = toBase64Url(
    encoder.encode(
      JSON.stringify({
        sub: userId,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
      })
    )
  );
  const data = `${header}.${payload}`;
  const key = await importJwtKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));

  return `${data}.${toBase64Url(signature)}`;
}

export async function verifyJwt(token: string, secret: string) {
  const [header, payload, signature] = token.split(".");

  if (!header || !payload || !signature) {
    return null;
  }

  const data = `${header}.${payload}`;
  const key = await importJwtKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    toArrayBuffer(fromBase64Url(signature)),
    encoder.encode(data)
  );

  if (!valid) {
    return null;
  }

  const body = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as {
    sub?: string;
    exp?: number;
  };

  if (!body.sub || !body.exp || body.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return {
    userId: body.sub
  };
}
