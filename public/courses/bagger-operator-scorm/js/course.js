const pages = [
  {
    type: 'content',
    title: 'Welcome: Bagger Operator Course',
    body: `<p>This course prepares bagger operators to work safely and efficiently in aggregate and material handling environments.</p>
      <ul>
        <li>Estimated time: 25–35 minutes</li>
        <li>Passing score: 80%</li>
        <li>Modules: Safety, startup/shutdown, loading accuracy, hazard response</li>
      </ul>`
  },
  {
    type: 'content',
    title: 'Module 1: Core Safety Practices',
    body: `<ul>
      <li>Wear PPE: hard hat, safety glasses, hearing protection, steel-toe boots, gloves.</li>
      <li>Complete pre-shift inspection and lockout/tagout where required.</li>
      <li>Never bypass guards, interlocks, or emergency stop systems.</li>
      <li>Keep hands clear of moving conveyors, pinch points, and rotating shafts.</li>
    </ul>`
  },
  {
    type: 'content',
    title: 'Module 2: Pre-Operation and Startup',
    body: `<ul>
      <li>Inspect belts, seals, bag spouts, scale calibration, and compressed air supply.</li>
      <li>Verify product lot and bag size settings before production.</li>
      <li>Perform dry run and test fill to confirm target weight tolerance.</li>
      <li>Communicate startup over radio and clear area before energizing machinery.</li>
    </ul>`
  },
  {
    type: 'content',
    title: 'Module 3: Operation Quality and Throughput',
    body: `<ul>
      <li>Monitor fill weights and reject bags outside tolerance.</li>
      <li>Adjust flow gates/feed rates gradually to prevent surges and blockages.</li>
      <li>Keep bag stitching/sealing consistent and readable for traceability.</li>
      <li>Record hourly output, downtime reason, and corrective actions.</li>
    </ul>`
  },
  {
    type: 'quiz',
    question: 'What should a bagger operator do before startup?',
    options: [
      'Begin production immediately if there is a backlog',
      'Perform inspection, verify settings, and run a test fill',
      'Disable alarms to avoid nuisance stops',
      'Skip communication and start quietly'
    ],
    correct: 1
  },
  {
    type: 'quiz',
    question: 'If bag weights are consistently under target, the BEST action is to:',
    options: [
      'Increase feed rate in controlled increments and recheck weights',
      'Ignore the issue until shift handoff',
      'Manually overfill random bags',
      'Continue running and delete weight logs'
    ],
    correct: 0
  },
  {
    type: 'quiz',
    question: 'Which behavior is always unsafe?',
    options: [
      'Using lockout/tagout during maintenance',
      'Wearing hearing protection in high-noise areas',
      'Reaching into a moving conveyor to clear a jam',
      'Testing emergency stops during scheduled checks'
    ],
    correct: 2
  },
  {
    type: 'quiz',
    question: 'How should you handle an emergency stop event?',
    options: [
      'Restart immediately to recover output',
      'Investigate cause, report incident, and restart per procedure',
      'Ask someone else to document it later',
      'Bypass the trip device if it happens twice'
    ],
    correct: 1
  }
];

let current = 0;
let answers = {};
let completed = false;

const contentEl = document.getElementById('content');
const nextBtn = document.getElementById('nextBtn');
const prevBtn = document.getElementById('prevBtn');
const progressInner = document.getElementById('progressInner');
const statusEl = document.getElementById('status');

function updateProgress() {
  const pct = ((current + 1) / pages.length) * 100;
  progressInner.style.width = `${pct}%`;
}

function render() {
  const page = pages[current];
  updateProgress();
  prevBtn.disabled = current === 0;
  nextBtn.textContent = current === pages.length - 1 ? 'Finish Course' : 'Next';

  if (page.type === 'content') {
    contentEl.innerHTML = `<h2>${page.title}</h2>${page.body}`;
  } else {
    const saved = answers[current];
    const optionsHtml = page.options.map((opt, i) => {
      let className = 'option';
      if (saved !== undefined) {
        if (i === page.correct) className += ' correct';
        if (saved === i && i !== page.correct) className += ' wrong';
      }
      return `<button class="${className}" data-opt="${i}">${opt}</button>`;
    }).join('');

    contentEl.innerHTML = `<h2>Knowledge Check</h2>
      <p><strong>${page.question}</strong></p>
      ${optionsHtml}
      <p class="badge">Select one answer.</p>`;

    contentEl.querySelectorAll('.option').forEach(btn => {
      btn.addEventListener('click', () => {
        if (answers[current] !== undefined) return;
        answers[current] = Number(btn.getAttribute('data-opt'));
        render();
      });
    });
  }
}

function calculateScore() {
  const quizPages = pages.map((p, i) => ({...p, index: i})).filter(p => p.type === 'quiz');
  const correct = quizPages.filter(p => answers[p.index] === p.correct).length;
  const score = Math.round((correct / quizPages.length) * 100);
  return { score, correct, total: quizPages.length };
}

function completeCourse() {
  const { score, correct, total } = calculateScore();
  const passed = score >= 80;
  completed = true;

  contentEl.innerHTML = `<h2>Course Complete</h2>
    <p>You answered <strong>${correct}</strong> of <strong>${total}</strong> questions correctly.</p>
    <p>Your score: <strong>${score}%</strong></p>
    <p class="${passed ? 'result-pass' : 'result-fail'}">Result: ${passed ? 'PASS' : 'NOT YET PASSING'}</p>
    <p>${passed ? 'You have met the completion requirement.' : 'Review the content and retake to reach 80%.'}</p>`;

  nextBtn.disabled = true;
  prevBtn.disabled = true;

  const scormReady = Scorm12.init();
  if (scormReady) {
    Scorm12.setValue('cmi.core.score.raw', score);
    Scorm12.setValue('cmi.core.lesson_status', passed ? 'passed' : 'failed');
    Scorm12.setValue('cmi.core.exit', '');
    Scorm12.commit();
    Scorm12.finish();
    statusEl.textContent = 'LMS tracking: score and completion successfully sent.';
  } else {
    statusEl.textContent = 'LMS API not detected. Running in standalone preview mode.';
  }
}

nextBtn.addEventListener('click', () => {
  if (current < pages.length - 1) {
    current += 1;
    render();
  } else if (!completed) {
    completeCourse();
  }
});

prevBtn.addEventListener('click', () => {
  if (current > 0) {
    current -= 1;
    render();
  }
});

window.addEventListener('beforeunload', () => {
  if (!completed) return;
  try { Scorm12.finish(); } catch (e) { /* no-op */ }
});

render();
