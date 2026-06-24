/**
 * TCP proxy между Chromium и upstream HTTPS-прокси.
 * Перехватывает TLS ClientHello после HTTP CONNECT-туннеля,
 * убирает ECH (0xfe0d) и Kyber/ML-KEM (0x11ec) из key_share,
 * затем прозрачно пробрасывает трафик дальше.
 */

const net = require('net');

const LISTEN_PORT = parseInt(process.env.STRIP_PROXY_PORT || '42308');
const UPSTREAM_HOST = '127.0.0.1';
const UPSTREAM_PORT = 42307;

function stripClientHello(data) {
  if (!data || data.length < 10) return data;
  if (data[0] !== 0x16 || data[5] !== 0x01) return data;

  let pos = 9 + 2 + 32;
  const sidLen = data[pos++]; pos += sidLen;
  const csLen = (data[pos] << 8) | data[pos + 1]; pos += 2 + csLen;
  const cmLen = data[pos++]; pos += cmLen;

  const extTotalPos = pos;
  const extTotalLen = (data[pos] << 8) | data[pos + 1];
  pos += 2;

  const newExts = [];
  const end = pos + extTotalLen;

  while (pos + 4 <= end) {
    const eType = (data[pos] << 8) | data[pos + 1];
    const eLen = (data[pos + 2] << 8) | data[pos + 3];
    const eData = data.slice(pos + 4, pos + 4 + eLen);

    if (eType === 0xfe0d) {
      // ECH — убираем
    } else if (eType === 0x0033) {
      // key_share — убираем Kyber (0x11ec) и GREASE
      const ksListLen = (eData[0] << 8) | eData[1];
      let kpos = 2;
      const keep = [];
      while (kpos + 4 <= 2 + ksListLen) {
        const group = (eData[kpos] << 8) | eData[kpos + 1];
        const kLen = (eData[kpos + 2] << 8) | eData[kpos + 3];
        const isGrEase = ((group >> 8) & 0xf) === (group & 0xf0) >> 4 &&
                         ((group >> 8) & 0xf) === (group & 0xf);
        if (group !== 0x11ec && group !== 0x6399 && !isGrEase) {
          keep.push(eData.slice(kpos, kpos + 4 + kLen));
        }
        kpos += 4 + kLen;
      }
      if (keep.length > 0) {
        const ksBody = Buffer.concat(keep);
        const newEData = Buffer.alloc(2 + ksBody.length);
        newEData[0] = (ksBody.length >> 8) & 0xff;
        newEData[1] = ksBody.length & 0xff;
        ksBody.copy(newEData, 2);
        const hdr = Buffer.alloc(4);
        hdr[0] = 0x00; hdr[1] = 0x33;
        hdr[2] = (newEData.length >> 8) & 0xff;
        hdr[3] = newEData.length & 0xff;
        newExts.push(Buffer.concat([hdr, newEData]));
      }
    } else {
      newExts.push(data.slice(pos, pos + 4 + eLen));
    }
    pos += 4 + eLen;
  }

  const newExtsData = Buffer.concat(newExts);
  const result = Buffer.concat([data.slice(0, extTotalPos + 2), newExtsData]);

  const newExtTotal = newExtsData.length;
  result[extTotalPos] = (newExtTotal >> 8) & 0xff;
  result[extTotalPos + 1] = newExtTotal & 0xff;

  const delta = newExtTotal - extTotalLen;
  const oldHs = (data[6] << 16) | (data[7] << 8) | data[8];
  const newHs = oldHs + delta;
  result[6] = (newHs >> 16) & 0xff; result[7] = (newHs >> 8) & 0xff; result[8] = newHs & 0xff;

  const oldRec = (data[3] << 8) | data[4];
  const newRec = oldRec + delta;
  result[3] = (newRec >> 8) & 0xff; result[4] = newRec & 0xff;

  return result;
}

const server = net.createServer((client) => {
  const upstream = net.createConnection({ host: UPSTREAM_HOST, port: UPSTREAM_PORT });

  let tunnelEstablished = false;
  let upBuf = Buffer.alloc(0);
  let tlsDone = false;

  upstream.on('data', (chunk) => {
    if (!tunnelEstablished) {
      upBuf = Buffer.concat([upBuf, chunk]);
      if (upBuf.includes(Buffer.from('200 Connection'))) {
        tunnelEstablished = true;
      }
    }
    if (!client.destroyed) client.write(chunk);
  });

  client.on('data', (chunk) => {
    if (tunnelEstablished && !tlsDone && chunk[0] === 0x16 && chunk.length > 5 && chunk[5] === 0x01) {
      tlsDone = true;
      chunk = stripClientHello(chunk);
    }
    if (!upstream.destroyed) upstream.write(chunk);
  });

  upstream.on('close', () => { if (!client.destroyed) client.destroy(); });
  client.on('close', () => { if (!upstream.destroyed) upstream.destroy(); });
  upstream.on('error', () => { if (!client.destroyed) client.destroy(); });
  client.on('error', () => { if (!upstream.destroyed) upstream.destroy(); });
});

server.listen(LISTEN_PORT, '127.0.0.1', () => {
  console.log(`tls-strip-proxy: 127.0.0.1:${LISTEN_PORT} -> ${UPSTREAM_HOST}:${UPSTREAM_PORT}`);
});

server.on('error', (err) => {
  console.error(`tls-strip-proxy error: ${err.message}`);
  process.exit(1);
});
