const encoder = new TextEncoder();
// passwordHashPrefix：密码哈希格式版本标识，方便后续升级算法。
const passwordHashPrefix = "pbkdf2-sha256";
// passwordHashIterations：PBKDF2 迭代次数，影响密码哈希成本。
const passwordHashIterations = 100_000;

/**
 * 将字节数组编码成 JWT 兼容的 base64url 字符串。
 */
function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/**
 * 将 base64url 字符串解码成字节数组。
 */
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

/**
 * 常量时间比较两个字节数组。
 *
 * 用于密码哈希校验，避免直接字符串比较带来的时序差异。
 */
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

/**
 * 将 Uint8Array 的有效区间转换成 ArrayBuffer。
 */
function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * 导入密码明文对应的 PBKDF2 原始密钥。
 */
async function importPasswordKey(password: string) {
  return crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits"
  ]);
}

/**
 * 使用 PBKDF2 派生密码哈希字节。
 */
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

/**
 * 对用户密码进行带盐哈希。
 */
export async function hashPassword(password: string) {
  // salt：每个密码独立生成的随机盐。
  const salt = crypto.getRandomValues(new Uint8Array(16));
  // hash：PBKDF2 派生出的密码哈希。
  const hash = await derivePasswordHash(password, salt, passwordHashIterations);

  return [
    passwordHashPrefix,
    String(passwordHashIterations),
    toBase64Url(salt),
    toBase64Url(hash)
  ].join(":");
}

/**
 * 校验用户输入密码是否匹配数据库中的哈希。
 */
export async function verifyPassword(password: string, storedHash: string) {
  // storedHash：格式为 prefix:iterations:salt:hash 的密码哈希字符串。
  const [prefix, iterationsValue, saltValue, hashValue] = storedHash.split(":");
  const iterations = Number(iterationsValue);

  if (prefix !== passwordHashPrefix || !Number.isInteger(iterations) || !saltValue || !hashValue) {
    return false;
  }

  // salt：从存储值中恢复的密码盐。
  const salt = fromBase64Url(saltValue);
  // expectedHash：数据库中保存的目标哈希。
  const expectedHash = fromBase64Url(hashValue);
  // hash：根据用户输入密码重新派生的哈希。
  const hash = await derivePasswordHash(password, salt, iterations);

  return equalBytes(hash, expectedHash);
}

/**
 * 导入 JWT HMAC 签名密钥。
 */
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

/**
 * 签发登录态 JWT。
 */
export async function signJwt(userId: string, secret: string) {
  // header：JWT 头部，当前固定使用 HS256。
  const header = toBase64Url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  // payload：JWT 载荷，包含用户 ID 和过期时间。
  const payload = toBase64Url(
    encoder.encode(
      JSON.stringify({
        sub: userId,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
      })
    )
  );
  // data：参与签名的 header.payload 字符串。
  const data = `${header}.${payload}`;
  // key：根据环境密钥导入的 HMAC key。
  const key = await importJwtKey(secret);
  // signature：HMAC-SHA256 签名结果。
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));

  return `${data}.${toBase64Url(signature)}`;
}

/**
 * 验证登录态 JWT 并返回用户身份。
 */
export async function verifyJwt(token: string, secret: string) {
  // token：格式为 header.payload.signature 的登录态凭证。
  const [header, payload, signature] = token.split(".");

  if (!header || !payload || !signature) {
    return null;
  }

  // data：验签时使用的 header.payload 字符串。
  const data = `${header}.${payload}`;
  // key：根据环境密钥导入的 HMAC key。
  const key = await importJwtKey(secret);
  // valid：签名是否匹配，失败时视为未登录。
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    toArrayBuffer(fromBase64Url(signature)),
    encoder.encode(data)
  );

  if (!valid) {
    return null;
  }

  // body：解析后的 JWT payload。
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
