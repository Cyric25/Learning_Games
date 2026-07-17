// rich-content.js – Gemeinsames Rendering für Text + KaTeX-Formeln + Bilder
// Eine Quelle der Wahrheit für ALLE Spiele/Editoren (per <script src> laden,
// bei Formel-Bedarf zusätzlich vorher ../lib/katex/katex.min.js einbinden;
// das zugehörige katex.min.css injiziert dieses Modul selbst).
//
// Inline-Syntax innerhalb normaler Strings (rückwärtskompatibel – reine
// Text-Strings bleiben unverändert gültig):
//   $...$      Formel (KaTeX, inline) – zählt NUR, wenn direkt nach dem
//              öffnenden und vor dem schließenden $ kein Leerzeichen steht
//              ("5 $ und 10 $" bleibt Text)
//   $$...$$    Formel (KaTeX, display/zentriert)
//   ![alt](q)  Bild; q = data/images/<datei> (Projekt-Ablage) oder https://…
//   \$  \|     literales Dollar- bzw. Pipe-Zeichen
//
// Sicherheit (XSS-Vertrauensgrenze, docs/architektur.md §8): Text wird IMMER
// escaped; Bild-src wird geklemmt (nur Projekt-Ablage oder https, keine
// Traversal-/javascript:/data:-Quellen); KaTeX escaped selbst.

(function () {
  'use strict';

  // Wurzel-URL des Projekts aus der eigenen Script-URL ableiten
  // (…/js/rich-content.js → …/). Im Node-Test (ohne DOM) bleibt sie leer.
  var RC_ROOT = '';
  if (typeof document !== 'undefined') {
    try {
      var cur = document.currentScript && document.currentScript.src;
      if (cur) RC_ROOT = new URL('..', cur).href;
    } catch (e) {}
  }

  function rcEsc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Ende einer $…$/$$…$$-Formel suchen; \x innerhalb TeX überspringen.
  function findMathEnd(s, from, display) {
    for (var i = from; i < s.length; i++) {
      if (s[i] === '\\') { i++; continue; }
      if (s[i] === '$') {
        if (!display) return i;
        if (s[i + 1] === '$') return i;
      }
    }
    return -1;
  }

  // Zerlegt einen String in Tokens: text | math | dmath | img
  function rcTokenize(str) {
    var s = String(str == null ? '' : str);
    var tokens = [];
    var text = '';
    var i = 0;
    while (i < s.length) {
      var c = s[i];
      if (c === '\\' && (s[i + 1] === '$' || s[i + 1] === '|')) {
        text += s[i + 1]; i += 2; continue;
      }
      if (c === '$') {
        var display = s[i + 1] === '$';
        var open = display ? 2 : 1;
        var close = findMathEnd(s, i + open, display);
        if (close !== -1) {
          var inner = s.slice(i + open, close);
          var valid = inner.length > 0 &&
            (display || (!/^\s/.test(inner) && !/\s$/.test(inner)));
          if (valid) {
            if (text) { tokens.push({ t: 'text', v: text }); text = ''; }
            tokens.push({ t: display ? 'dmath' : 'math', v: inner });
            i = close + open;
            continue;
          }
        }
        text += c; i++; continue;
      }
      if (c === '!' && s[i + 1] === '[') {
        var m = /^!\[([^\]]*)\]\(([^)\s]+)\)/.exec(s.slice(i));
        if (m) {
          if (text) { tokens.push({ t: 'text', v: text }); text = ''; }
          tokens.push({ t: 'img', alt: m[1], src: m[2] });
          i += m[0].length;
          continue;
        }
        text += c; i++; continue;
      }
      text += c; i++;
    }
    if (text) tokens.push({ t: 'text', v: text });
    return tokens;
  }

  // Bildquelle klemmen: nur Projekt-Ablage data/images/<datei> oder https://…
  // Liefert null für alles Unsichere (javascript:, data:, ../-Traversal, …).
  function rcSafeImgSrc(src) {
    if (/^https:\/\/[^\s"'<>]+$/i.test(src)) return src;
    var m = /^(?:\.\/)?data\/images\/([A-Za-z0-9._-]+)$/.exec(src);
    if (m && m[1].indexOf('..') === -1) {
      // Von jeder Seitentiefe aus korrekt: absolute URL über die Modul-Wurzel
      return RC_ROOT ? RC_ROOT + 'data/images/' + m[1] : 'data/images/' + m[1];
    }
    return null;
  }

  function renderMath(tex, display) {
    var k = (typeof window !== 'undefined') ? window.katex : null;
    if (k && k.renderToString) {
      try {
        var out = k.renderToString(tex, { throwOnError: false, displayMode: display });
        return display ? '<span class="rc-display-math">' + out + '</span>' : out;
      } catch (e) { /* fällt auf Rohtext zurück */ }
    }
    // Degradation ohne KaTeX (z. B. solo kopierte standalone.html): Quelltext
    return rcEsc(display ? '$$' + tex + '$$' : '$' + tex + '$');
  }

  // Haupt-API: String → sicheres HTML
  function renderRichContent(str) {
    var tokens = rcTokenize(str);
    var html = '';
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      if (tok.t === 'text') {
        html += rcEsc(tok.v);
      } else if (tok.t === 'math' || tok.t === 'dmath') {
        html += renderMath(tok.v, tok.t === 'dmath');
      } else if (tok.t === 'img') {
        var src = rcSafeImgSrc(tok.src);
        if (src) {
          html += '<img class="rc-img" src="' + rcEsc(src) + '" alt="' +
            rcEsc(tok.alt) + '" loading="lazy">';
        } else {
          html += rcEsc(tok.alt || ''); // unsichere Quelle → nur Alt-Text
        }
      }
    }
    return html;
  }

  // Reiner Text für Stellen ohne HTML (Codenames-Karten, Vergleiche):
  // Formeln → TeX-Quelltext, Bilder → Alt-Text, Escapes aufgelöst.
  function richToPlainText(str) {
    var tokens = rcTokenize(str);
    var out = '';
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      if (tok.t === 'text') out += tok.v;
      else if (tok.t === 'math' || tok.t === 'dmath') out += tok.v;
      else out += tok.alt || '';
    }
    return out;
  }

  // ── Editor-Helfer ─────────────────────────────────────────────────
  // Upload an api.php?f=image-upload (Admin-Token wie in allen Lehrkraft-
  // Seiten – kein Geheimnis, nur Vandalismus-Hürde, docs/architektur.md §8).
  // Liefert den kanonischen Pfad 'data/images/<datei>' für ![alt](…).
  async function rcUploadImage(file) {
    var fd = new FormData();
    fd.append('image', file);
    var r = await fetch(RC_ROOT + 'api.php?f=image-upload', {
      method: 'POST',
      headers: { 'X-Admin-Key': 'LP-Spiele-2026' },
      body: fd
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok || !j.ok) throw new Error(j.error || ('Upload fehlgeschlagen (HTTP ' + r.status + ')'));
    return j.path;
  }

  // Live-Vorschau: rendert den Feldinhalt bei jeder Eingabe in previewEl.
  function rcBindPreview(inputEl, previewEl) {
    if (!inputEl || !previewEl) return;
    var update = function () {
      var v = inputEl.value || '';
      var has = /[$!\\]/.test(v); // Vorschau nur zeigen, wenn Marker vorkommen
      previewEl.innerHTML = has ? renderRichContent(v) : '';
      previewEl.style.display = has ? '' : 'none';
    };
    inputEl.addEventListener('input', update);
    update();
  }

  // ── Styles + KaTeX-CSS einmalig injizieren ────────────────────────
  if (typeof document !== 'undefined') {
    (function () {
      if (document.getElementById('rc-styles')) return;
      var st = document.createElement('style');
      st.id = 'rc-styles';
      st.textContent =
        '.rc-img{max-width:100%;max-height:40vh;border-radius:8px;vertical-align:middle;}' +
        '.rc-display-math{display:block;text-align:center;margin:0.4em 0;overflow-x:auto;}' +
        '.rc-preview{margin-top:6px;padding:8px 10px;border:1px dashed var(--border,#bbb);' +
        'border-radius:8px;font-size:0.95em;text-align:left;}';
      document.head.appendChild(st);
      if (RC_ROOT && !document.querySelector('link[data-rc-katex]')) {
        var l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = RC_ROOT + 'lib/katex/katex.min.css';
        l.setAttribute('data-rc-katex', '1');
        document.head.appendChild(l);
      }
    })();
  }

  // Exporte: Browser global, Node (Roundtrip-/Parser-Tests) via module
  var api = {
    renderRichContent: renderRichContent,
    richToPlainText: richToPlainText,
    rcTokenize: rcTokenize,
    rcSafeImgSrc: rcSafeImgSrc,
    rcUploadImage: rcUploadImage,
    rcBindPreview: rcBindPreview
  };
  if (typeof window !== 'undefined') {
    window.renderRichContent = renderRichContent;
    window.richToPlainText = richToPlainText;
    window.rcUploadImage = rcUploadImage;
    window.rcBindPreview = rcBindPreview;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
