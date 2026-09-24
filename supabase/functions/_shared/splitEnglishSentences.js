/**
 * 영어 문장 경계 분리 — Syntax Studio와 구문랩(import-claude-handout)이 같이 씀.
 * 약어(Mr./Ms./U.S./p.m.)·닫는 인용부호·말줄임(...)에서 문장을 잘라 내지 않고,
 * 글자는 버리지 않는다. 종결부호 없는 제목·날짜 줄은 다음 대문자 줄과 분리한다.
 *
 * 브라우저: <script src="assets/split-english-sentences.js"> → globalThis.GWJSplit
 * Node: require('./split-english-sentences.js')
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GWJSplit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var CLOSERS = /["'”’»)\]\]]/;
  var TITLE_ABBREV = {
    mr: 1, mrs: 1, ms: 1, dr: 1, prof: 1, sr: 1, jr: 1, st: 1,
    gen: 1, col: 1, lt: 1, sgt: 1, rev: 1, hon: 1
  };
  /** 뒤가 소문자면 문장 끝이 아님. 대문자로 새 문장이 시작하면 끊음 (7 p.m. This). */
  var SOFT_ABBREV = {
    am: 1, pm: 1, us: 1, uk: 1, usa: 1, eg: 1, ie: 1, etc: 1, vs: 1,
    inc: 1, ltd: 1, fig: 1, vol: 1, no: 1, pp: 1, al: 1,
    jan: 1, feb: 1, mar: 1, apr: 1, jun: 1, jul: 1, aug: 1,
    sep: 1, sept: 1, oct: 1, nov: 1, dec: 1
  };

  function closersEnd(text, i) {
    var j = i;
    while (j + 1 < text.length && CLOSERS.test(text[j + 1])) j++;
    return j;
  }

  function restAfter(text, i) {
    return text.slice(closersEnd(text, i) + 1);
  }

  function hasBoundary(text, i) {
    var rest = restAfter(text, i);
    return rest.length === 0 || /^\s/.test(rest);
  }

  function nextIsSentenceStart(text, i) {
    var rest = restAfter(text, i);
    if (!rest) return true;
    return /^\s+["'“‘(\[]*[A-Z]/.test(rest);
  }

  function abbrevWord(text, periodIndex) {
    var s = periodIndex;
    while (s > 0 && /[A-Za-z.]/.test(text[s - 1])) s--;
    return text.slice(s, periodIndex);
  }

  function periodShouldSplit(text, i) {
    var prev = text[i - 1] || '';
    var next = text[i + 1] || '';
    if (/\d/.test(prev) && /\d/.test(next)) return false;

    var word = abbrevWord(text, i);
    if (/^[A-Z]$/.test(word)) return false;
    if (/^[ap]$/i.test(word) && /^m(?:\.|\b)/i.test(text.slice(i + 1))) return false;

    var norm = word.toLowerCase().replace(/\./g, '');
    if (TITLE_ABBREV[word.toLowerCase()] || TITLE_ABBREV[norm]) return false;
    if (SOFT_ABBREV[norm]) return nextIsSentenceStart(text, i);
    return true;
  }

  function splitOnTerminators(text) {
    var parts = [];
    var buf = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      buf += ch;
      if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '…') continue;

      var end = i;
      var dots = ch === '.' ? 1 : 0;
      if (ch === '.') {
        while (end + 1 < text.length && text[end + 1] === '.') {
          end++;
          buf += '.';
          dots++;
        }
        i = end;
      }

      if (!hasBoundary(text, i)) continue;
      if (dots === 1 && !periodShouldSplit(text, i)) continue;

      var j = closersEnd(text, i);
      if (j > i) {
        buf += text.slice(i + 1, j + 1);
        i = j;
      }
      var sentence = buf.trim();
      if (sentence) parts.push(sentence);
      buf = '';
    }
    var tail = buf.trim();
    if (tail) parts.push(tail);
    return parts;
  }

  /** 마침표 없이 끝난 줄 다음에 대문자 줄이 오면 제목·날짜로 분리 */
  function splitBareHeadingLines(text) {
    var lines = String(text || '').split('\n');
    var blocks = [];
    var buf = [];
    function flush() {
      var s = buf.join('\n').trim();
      buf = [];
      if (s) blocks.push(s);
    }
    for (var i = 0; i < lines.length; i++) {
      var cur = lines[i].trim();
      if (i > 0 && buf.length && cur) {
        var prev = buf[buf.length - 1].trim();
        var prevEnds = /[.!?…]["'”’»)\]\]]*$/.test(prev);
        var curStarts = /^["'“‘(\[]*[A-Z0-9]/.test(cur);
        if (prev && !prevEnds && curStarts) flush();
      }
      buf.push(lines[i]);
    }
    flush();
    return blocks.length ? blocks : [String(text || '')];
  }

  function splitEnglishSentences(text) {
    var trimmed = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!trimmed) return [];

    var blocks = splitBareHeadingLines(trimmed);
    var parts = [];
    for (var b = 0; b < blocks.length; b++) {
      var chunk = splitOnTerminators(blocks[b]);
      for (var c = 0; c < chunk.length; c++) parts.push(chunk[c]);
    }

    if (parts.length <= 1 && trimmed.indexOf('\n') >= 0) {
      var lines = trimmed.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (lines.length > 1) return lines;
    }
    return parts.length ? parts : [trimmed];
  }

  /**
   * 통입력(본문통합)은 전송 시 사용자가 선택한다.
   * 커리큘럼 제한 없음 — 호환용으로 true 유지.
   */
  function allowsWholePassageInput(/* meta */) {
    return true;
  }

  return {
    splitEnglishSentences: splitEnglishSentences,
    allowsWholePassageInput: allowsWholePassageInput
  };
});
