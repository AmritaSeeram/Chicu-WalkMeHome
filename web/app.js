(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const steps = [...document.querySelectorAll('[data-step]')];
  const play = $('play-demo');
  const plan = $('shared-plan');
  let current = 0;
  let timer = null;
  let config = { ping2AfterMin: 5, alertAfterMin: 10, waitWindowMin: 5, slowdownFactor: 2, pdLinkAtMin: 30 };
  const formatted = (minutes) => `T+${String(minutes).padStart(2, '0')}`;
  const times = () => [0, config.ping2AfterMin, config.alertAfterMin, config.alertAfterMin + config.waitWindowMin * (plan.checked ? config.slowdownFactor : 1), config.pdLinkAtMin];

  function render() {
    const shared = plan.checked;
    const timeline = times();
    const scenes = [
      { channel: 'PRIVATE MESSAGE · MAYA', sender: 'Maya’s personal agent', avatar: 'M', recipient: 'Only Maya sees this.', message: 'You good? Your check-in time just passed.', explanation: 'Start with a private nudge. The group hasn’t been alerted.' },
      { channel: 'PRIVATE MESSAGE · MAYA', sender: 'Maya’s personal agent', avatar: 'M', recipient: 'A second private check-in.', message: 'Checking in again. You good?', explanation: 'Still no reply? Try once more before bringing in the circle.' },
      { channel: 'GROUP CHAT · YOUR CIRCLE', sender: 'The group agent', avatar: '↗', recipient: 'A checked message to the group.', message: shared ? 'Maya hasn’t checked in. Last seen near the library.\n\nPriya says this is expected.' : 'Maya hasn’t checked in. Last seen near the library.', explanation: shared ? 'Priya confirms a plan she was allowed to see. The group gets “expected,” not private details. The response window slows; the ladder stays active.' : 'The group gets a place label. Personal agents privately check availability and any plans their owners were allowed to see.' },
      { channel: 'PRIVATE MESSAGE · PRIYA', sender: 'Priya’s personal agent', avatar: 'P', recipient: 'Your choice to accept or decline.', message: 'You’re nearby and available. Can you head to the library?', explanation: `Rules rank friends by ETA, then car, then who was least recently asked. A decline or timeout moves to the next available person.${shared ? ' The shared-plan window adds a wait here.' : ''}` },
      { channel: 'GROUP CHAT · YOUR CIRCLE', sender: 'The group agent', avatar: '↗', recipient: 'Escalation information stays visible.', message: 'Still no check-in from Maya. Campus contact information is here if your circle needs it.', explanation: 'The contact reminder is not delayed by a shared plan. The system does not make an emergency call or establish that someone is safe.' },
    ];
    const scene = scenes[current];
    steps.forEach((button, i) => {
      button.classList.toggle('active', i === current);
      button.setAttribute('aria-pressed', String(i === current));
      button.querySelector('.timeline-time').textContent = formatted(timeline[i]);
    });
    $('demo-channel').textContent = scene.channel;
    $('demo-time').textContent = formatted(timeline[current]);
    $('demo-avatar').textContent = scene.avatar;
    $('demo-avatar').classList.toggle('group-avatar', current === 2 || current === 4);
    $('demo-sender').textContent = scene.sender;
    $('demo-recipient').textContent = scene.recipient;
    $('demo-message').textContent = scene.message;
    $('demo-explanation').textContent = scene.explanation;
    $('plan-explanation').textContent = shared ? `First ask moves to ${formatted(timeline[3])}. The contact reminder stays at ${formatted(config.pdLinkAtMin)}.` : 'The usual timeline applies.';
    $('next-step').firstChild.textContent = current === scenes.length - 1 ? 'Start again ' : 'Next step ';
    const outcome = $('demo-outcome');
    outcome.hidden = current < 2;
    outcome.replaceChildren();
    if (current >= 2) {
      const link = document.createElement('a');
      link.href = 'https://cfo.asu.edu/police-contact';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Official ASU contact information ↗';
      outcome.append(link, document.createTextNode(' · Calling stays with you.'));
    }
    const playing = timer !== null;
    play.setAttribute('aria-pressed', String(playing));
    play.querySelector('span').textContent = playing ? 'Pause walkthrough' : current === 4 ? 'Replay walkthrough' : 'Play walkthrough';
    play.querySelector('use').setAttribute('href', playing ? '#i-pause' : '#i-play');
  }
  function stop() { if (timer !== null) window.clearInterval(timer); timer = null; }
  steps.forEach((button) => button.addEventListener('click', () => { stop(); current = Number(button.dataset.step); render(); }));
  plan.addEventListener('change', render);
  $('next-step').addEventListener('click', () => { stop(); current = (current + 1) % steps.length; render(); });
  play.addEventListener('click', () => {
    if (timer !== null) { stop(); render(); return; }
    if (current === steps.length - 1) current = 0;
    timer = window.setInterval(() => { current += 1; if (current === steps.length - 1) stop(); render(); }, 2800);
    render();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); render(); } });
  render();
  fetch('config.json').then((response) => { if (!response.ok) throw new Error('Configuration unavailable'); return response.json(); }).then((data) => {
    const keys = Object.keys(config);
    if (keys.every((key) => Number.isFinite(data[key]) && data[key] > 0)) config = Object.fromEntries(keys.map((key) => [key, data[key]]));
    render();
  }).catch(() => { /* The checked-in defaults keep this standalone illustration usable. */ });
})();
