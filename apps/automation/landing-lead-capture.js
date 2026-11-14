/*!
 * Predict lead capture — paste this on landing.optmhealthcare.in
 *
 * It listens for any form being submitted on the page and sends a COPY of the
 * answers to our CRM. It never touches the form's own submit, so whatever the
 * page already does (its own CRM, Zapier, an email) keeps working exactly as
 * before — this only adds a second listener.
 *
 * Paste it once, just before </body>, on every page that has a form.
 */
(function () {
  "use strict";

  var ENDPOINT = "https://hooks.predict.fit/webhooks/website-leads";
  // Shown to us as the form's name, so leads from different pages are
  // distinguishable in the CRM.
  var FORM_NAME = document.title || "Landing page";

  // Field names vary by form builder; these are the ones we look for.
  var PHONE = /phone|mobile|contact|whats|number|tel/i;
  var EMAIL = /e-?mail/i;
  var NAME = /name/i;
  var IGNORE = /pass|card|cvv|otp|captcha|csrf|nonce|token|submit/i;

  function params() {
    var out = {};
    try {
      var q = new URLSearchParams(window.location.search);
      ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id", "gclid", "fbclid"].forEach(
        function (k) {
          var v = q.get(k);
          if (v) out[k] = v;
        },
      );
    } catch (e) {
      /* old browser: tracking is a bonus, never a reason to lose the lead */
    }
    return out;
  }

  function collect(form) {
    var data = {};
    var inputs = form.querySelectorAll("input, select, textarea");
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      var key = el.name || el.id || el.getAttribute("placeholder") || "";
      if (!key || IGNORE.test(key) || el.type === "hidden" && !el.value) continue;
      if ((el.type === "checkbox" || el.type === "radio") && !el.checked) continue;
      if (!el.value) continue;

      // A hidden field a real person never fills is how we spot bots — if the
      // form has one called website/_hp, pass it through untouched.
      if (key === "website" || key === "_hp") {
        data[key] = el.value;
        continue;
      }
      if (PHONE.test(key) && !data.phone) data.phone = el.value;
      else if (EMAIL.test(key) && !data.email) data.email = el.value;
      else if (NAME.test(key) && !data.name) data.name = el.value;
      else data[key] = String(el.value).slice(0, 500);
    }
    return data;
  }

  function send(form) {
    var data = collect(form);
    // Nothing to reach them on — not a lead, don't send noise.
    if (!data.phone && !data.email) return;

    var payload = collect(form);
    var extras = params();
    for (var k in extras) payload[k] = extras[k];
    payload.formName = FORM_NAME;
    payload.pageUrl = window.location.href;
    // Lets a double-click or a retry count as one lead, not two.
    payload.submissionId =
      "lp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);

    var body = new URLSearchParams();
    for (var key in payload) if (payload[key] != null) body.append(key, payload[key]);

    try {
      // keepalive: the page is usually navigating away as this fires, and
      // without it the browser cancels the request mid-flight.
      // x-www-form-urlencoded avoids a CORS preflight entirely.
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        keepalive: true,
        mode: "cors",
        credentials: "omit",
      }).catch(function () {});
    } catch (e) {
      /* never let this break the page's own submit */
    }
  }

  // Capture phase, so we still see it if the form's own handler stops the
  // event from bubbling.
  document.addEventListener(
    "submit",
    function (event) {
      var form = event.target;
      if (form && form.tagName === "FORM") {
        try {
          send(form);
        } catch (e) {}
      }
    },
    true,
  );
})();
