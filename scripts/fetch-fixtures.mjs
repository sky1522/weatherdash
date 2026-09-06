/**
 * P0 응답 픽스처 수집기.
 *
 * 기상청 API 허브의 원문 응답을 fixtures/raw/ 에 **바이트 그대로** 저장한다.
 * 인코딩 변환을 하지 않는다. 판정 1번(UTF-8 / EUC-KR)이 여기에 달려 있다.
 *
 * 실행: pnpm fixtures
 * 전제: .dev.vars 에 KMA_AUTH_KEY 가 채워져 있어야 한다.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'fixtures', 'raw');
const ORIGIN = 'https://apihub.kma.go.kr';

const ENDPOINTS = {
  typ_lst: '/api/typ01/url/typ_lst.php',
  typ_data: '/api/typ01/url/typ_data.php',
  typ_now: '/api/typ01/url/typ_now.php',
};

/** 레퍼런스 케이스: 2026년 제24호 태풍 크로반(KROVANH). */
const TARGET_YEAR = '2026';
const TARGET_TYP = '24';

async function readAuthKey() {
  let text;
  try {
    text = await readFile(path.join(ROOT, '.dev.vars'), 'utf8');
  } catch {
    fail('.dev.vars 가 없다. `cp .dev.vars.example .dev.vars` 후 KMA_AUTH_KEY 를 채운다.');
  }
  const line = text.split(/\r?\n/).find((l) => /^\s*KMA_AUTH_KEY\s*=/.test(l));
  const value = line?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  if (!value) fail('.dev.vars 의 KMA_AUTH_KEY 가 비어 있다.');
  return value;
}

function fail(message) {
  console.error(`[fixtures] ${message}`);
  process.exit(1);
}

/** 저장 파일명에도, 매니페스트에도 authKey 를 남기지 않는다. */
function describe(params) {
  const safe = { ...params };
  delete safe.authKey;
  return safe;
}

async function get(endpointPath, params, authKey) {
  const url = new URL(endpointPath, ORIGIN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('authKey', authKey);

  const response = await fetch(url, { headers: { accept: '*/*' } });
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    bytes,
  };
}

/**
 * 발표번호(seq) 확정용 1회성 조회.
 * seq 를 생략하면 마지막 발표가 온다. 그 값을 읽어 이후 수집에서는 seq 를 명시한다.
 * (SKILL.md — 인자 생략은 비결정적이므로 픽스처에는 명시된 seq 만 남긴다)
 *
 * 여기서 쓰는 정규식은 seq 발견용이지 파서가 아니다. 파서는 P1 범위다.
 */
function discoverSeq(bytes) {
  const text = bytes.toString('utf8');
  const matches = [...text.matchAll(/^\s*\d{4}\s*,\s*\d+\s*,\s*(\d+)\s*,/gm)].map((m) =>
    Number(m[1]),
  );
  if (matches.length === 0) return null;
  return Math.max(...matches);
}

async function main() {
  const authKey = await readAuthKey();
  await mkdir(OUT_DIR, { recursive: true });

  // 1단계 — seq 확정
  const probe = await get(
    ENDPOINTS.typ_data,
    { YY: TARGET_YEAR, typ: TARGET_TYP, mode: '1', disp: '1', help: '2' },
    authKey,
  );
  const seq = discoverSeq(probe.bytes);
  if (seq === null) {
    console.warn(
      `[fixtures] seq 자동 확정 실패 (HTTP ${probe.status}). seq 없이 수집한다. 응답 첫 200바이트:`,
    );
    console.warn(probe.bytes.subarray(0, 200).toString('utf8'));
  } else {
    console.log(`[fixtures] 발표번호 확정: seq=${seq}`);
  }

  const seqParam = seq === null ? {} : { seq: String(seq) };

  // typ_now 의 tm 은 UTC 기준. 현재 시각을 분 단위로 내림해 고정한다.
  const now = new Date();
  const tm =
    `${now.getUTCFullYear()}` +
    `${String(now.getUTCMonth() + 1).padStart(2, '0')}` +
    `${String(now.getUTCDate()).padStart(2, '0')}` +
    `${String(now.getUTCHours()).padStart(2, '0')}` +
    `00`;

  const base = {
    typ_lst: { YY: TARGET_YEAR },
    typ_data: { YY: TARGET_YEAR, typ: TARGET_TYP, ...seqParam, mode: '1' },
    typ_now: { tm, mode: '1' },
  };

  const jobs = [];
  for (const name of Object.keys(ENDPOINTS)) {
    for (const disp of ['0', '1']) {
      for (const help of ['0', '1', '2']) {
        jobs.push({
          file: `${name}_disp${disp}_help${help}.txt`,
          endpoint: ENDPOINTS[name],
          params: { ...base[name], disp, help },
        });
      }
    }
  }

  // 판정 3번 — 진행 중 태풍이 없을 때의 응답 형태.
  // 존재하지 않는 태풍번호를 조회해 "없음"과 "오류"가 어떻게 구분되는지 본다.
  jobs.push({
    file: 'typ_data_absent_disp1_help2.txt',
    endpoint: ENDPOINTS.typ_data,
    params: { YY: TARGET_YEAR, typ: '99', seq: '1', mode: '1', disp: '1', help: '2' },
    note: '존재하지 않는 태풍번호(99). 부재 응답 형태 판정용.',
  });
  jobs.push({
    file: 'typ_now_absent_disp1_help2.txt',
    endpoint: ENDPOINTS.typ_now,
    params: { tm: '190001010000', mode: '1', disp: '1', help: '2' },
    note: '태풍이 존재할 수 없는 과거 시각. 부재 응답 형태 판정용.',
  });

  const manifest = [];
  for (const job of jobs) {
    const result = await get(job.endpoint, job.params, authKey);

    // 🚨 응답 본문에 인증키가 에코되면 픽스처를 커밋하는 순간 키가 유출된다.
    if (result.bytes.includes(Buffer.from(authKey, 'utf8'))) {
      fail(`${job.file}: 응답 본문에 인증키가 포함되어 있다. 저장을 중단한다.`);
    }

    await writeFile(path.join(OUT_DIR, job.file), result.bytes);

    manifest.push({
      file: job.file,
      endpoint: job.endpoint,
      params: describe(job.params),
      httpStatus: result.status,
      contentType: result.contentType,
      bytes: result.bytes.length,
      sha256: createHash('sha256').update(result.bytes).digest('hex'),
      ...(job.note ? { note: job.note } : {}),
    });

    console.log(
      `[fixtures] ${job.file.padEnd(34)} HTTP ${result.status}  ${String(result.bytes.length).padStart(7)} bytes  ${result.contentType}`,
    );
  }

  await writeFile(
    path.join(OUT_DIR, 'manifest.json'),
    JSON.stringify(
      {
        collectedAt: new Date().toISOString(),
        target: { year: TARGET_YEAR, typ: TARGET_TYP, seq, name: 'KROVANH / 크로반' },
        note: 'authKey 는 매니페스트에 기록하지 않는다. 응답 본문은 바이트 그대로 저장했다.',
        files: manifest,
      },
      null,
      2,
    ) + '\n',
  );

  console.log(`[fixtures] 완료. ${manifest.length}건을 fixtures/raw/ 에 저장했다.`);
}

await main();
