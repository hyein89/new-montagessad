(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var captcha = document.querySelector('.captcha');
    if (!captcha) return;

    var started = false;
    var completed = false;
    var verificationPromise = null;

    var startVerification = function (delayMs) {
      if (completed) return Promise.resolve();
      if (started && verificationPromise) return verificationPromise;

      started = true;
      captcha.classList.add('is-verifying');
      captcha.setAttribute('aria-busy', 'true');

      var timeout = typeof delayMs === 'number' && delayMs > 0 ? delayMs : 1000;
      verificationPromise = new Promise(function (resolve) {
        setTimeout(function () {
          captcha.classList.remove('is-verifying');
          captcha.classList.add('is-verified');
          captcha.setAttribute('aria-busy', 'false');
          completed = true;
          captcha.dispatchEvent(new CustomEvent('captcha:verified', { bubbles: true }));
          resolve();
        }, timeout);
      });

      return verificationPromise;
    };

    window.CAPTCHA_UI = {
      startVerification: startVerification
    };
  });
})();