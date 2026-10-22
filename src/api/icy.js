// Current track straight from the stream: ask for ICY metadata, read just
// past the first metadata block, pull out StreamTitle, hang up.
//
// Uses XMLHttpRequest rather than fetch: RN's fetch only resolves once the
// body finishes, which never happens for a live stream, while XHR hands over
// the body as it arrives. That body is binary audio decoded as text, so byte
// offsets can't be trusted; instead we search the text for the metadata
// block itself, which is plain ASCII/UTF-8.

const TIMEOUT_MS = 8000;
// Give up after this many characters if no metadata block has turned up.
const MAX_READ = 256 * 1024;
const STREAM_TITLE = /StreamTitle='(.*?)';/;

/**
 * Resolves the stream's current StreamTitle (string, or null if blank), or
 * undefined if the server doesn't send ICY metadata. Never rejects.
 */
export function fetchTrackMetadata(streamUrl) {
  return new Promise((resolve) => {
    if (!/^https?:\/\//i.test(streamUrl || '')) return resolve(undefined);
    const xhr = new XMLHttpRequest();
    let settled = false;
    let metaint = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        xhr.abort();
      } catch {}
      resolve(result);
    };
    const timer = setTimeout(() => finish(undefined), TIMEOUT_MS);

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 2 && metaint == null) {
        metaint = parseInt(xhr.getResponseHeader('icy-metaint'), 10);
        if (!(metaint > 0)) finish(undefined);
      }
    };
    xhr.onprogress = () => {
      const text = xhr.responseText || '';
      const match = STREAM_TITLE.exec(text);
      if (match) finish(match[1].trim() || null);
      else if (text.length > Math.max(MAX_READ, metaint * 3)) finish(undefined);
    };
    xhr.onerror = () => finish(undefined);

    try {
      xhr.open('GET', streamUrl);
      xhr.setRequestHeader('Icy-MetaData', '1');
      xhr.send();
    } catch {
      finish(undefined);
    }
  });
}
