(function () {
  function bindPlayer(root) {
    var play = root.querySelector('[data-featured-play]');
    var poster = root.querySelector('[data-player-poster]');
    var host = root.querySelector('[data-featured-frame]');
    var panel = root.querySelector('[data-featured-status-panel]');
    var status = root.querySelector('[data-featured-status]');
    var retry = root.querySelector('[data-featured-retry]');
    var shell = root.closest('[data-player-shell]');
    var fullscreen = shell && shell.querySelector('[data-player-fullscreen]');
    var frame = null;
    var timer = null;
    var attempt = 0;

    function supportsWebGL2() {
      try {
        var context = document.createElement('canvas').getContext('webgl2');
        if (!context) return false;
        var release = context.getExtension('WEBGL_lose_context');
        if (release) release.loseContext();
        return true;
      } catch (_) { return false; }
    }

    function showStatus(message, state) {
      root.dataset.playerState = state;
      panel.classList.remove('hidden');
      status.textContent = message;
    }

    function start() {
      if (frame) return;
      play.disabled = true;
      var currentAttempt = ++attempt;
      if (!supportsWebGL2()) {
        poster.classList.add('hidden');
        showStatus('This browser cannot provide WebGL 2, which this game needs. Try a recent browser with hardware acceleration enabled, or choose another game from Library.', 'unsupported');
        retry.focus();
        return;
      }

      poster.classList.add('hidden');
      showStatus('Opening the game page. The game will download and start inside the player; this can take a little while.', 'opening');
      frame = document.createElement('iframe');
      frame.title = root.dataset.gameTitle + ' featured game';
      frame.allow = 'fullscreen';
      frame.allowFullscreen = true;
      frame.addEventListener('load', function () {
        if (currentAttempt !== attempt) return;
        clearTimeout(timer);
        showStatus('Game page opened. Engine startup continues inside the player. If it stays blank or shows an error, try Retry game.', 'page-opened');
      });
      frame.addEventListener('error', function () {
        if (currentAttempt !== attempt) return;
        clearTimeout(timer);
        showStatus('The game page could not be opened. Check your connection, then try Retry game or choose another game from Library.', 'failed');
      });
      timer = setTimeout(function () {
        if (currentAttempt !== attempt) return;
        showStatus('Still waiting for the game page. You can keep waiting, try Retry game, or choose another game from Library.', 'waiting');
      }, 20000);
      frame.src = root.dataset.gameUrl;
      host.appendChild(frame);
      if (fullscreen) fullscreen.disabled = false;
      document.dispatchEvent(new CustomEvent('tpx:player-created'));
      // Make Retry immediately reachable by keyboard during page loading.
      retry.focus();
    }

    play.addEventListener('click', start);
    retry.addEventListener('click', function () {
      ++attempt;
      clearTimeout(timer);
      if (frame) frame.remove();
      frame = null;
      if (fullscreen) fullscreen.disabled = true;
      start();
    });
  }

  document.querySelectorAll('[data-featured-player]').forEach(bindPlayer);
})();
