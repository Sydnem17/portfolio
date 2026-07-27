import type { Course } from './course';

// Tiny inline SVG floor plan so the demo stays fully self-contained.
const floorPlanSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450" font-family="sans-serif">
<rect width="800" height="450" fill="#eef1f6"/>
<rect x="20" y="20" width="760" height="410" fill="#ffffff" stroke="#1b2430" stroke-width="4"/>
<rect x="20" y="20" width="240" height="180" fill="#dde7f5" stroke="#1b2430" stroke-width="3"/>
<text x="140" y="115" text-anchor="middle" font-size="22" fill="#1b2430">Open office</text>
<rect x="20" y="230" width="240" height="200" fill="#e4f0e4" stroke="#1b2430" stroke-width="3"/>
<text x="140" y="335" text-anchor="middle" font-size="22" fill="#1b2430">Meeting rooms</text>
<rect x="300" y="20" width="300" height="410" fill="#f7f3e8" stroke="#1b2430" stroke-width="3"/>
<text x="450" y="230" text-anchor="middle" font-size="22" fill="#1b2430">Warehouse floor</text>
<rect x="640" y="20" width="140" height="180" fill="#f5e3e3" stroke="#1b2430" stroke-width="3"/>
<text x="710" y="115" text-anchor="middle" font-size="20" fill="#1b2430">Kitchen</text>
<rect x="640" y="240" width="140" height="190" fill="#e8e3f5" stroke="#1b2430" stroke-width="3"/>
<text x="710" y="340" text-anchor="middle" font-size="18" fill="#1b2430">Stairwell B</text>
<rect x="270" y="20" width="24" height="60" fill="#c62f2f"/>
<text x="282" y="105" text-anchor="middle" font-size="14" fill="#c62f2f">Stair A</text>
</svg>`;
const floorPlanSrc = `data:image/svg+xml;base64,${btoa(floorPlanSvg)}`;

/**
 * Demo template: a first-person emergency-response course in the style the
 * tool is built for — the learner *is* in the building, holding a radio,
 * making decisions under time pressure. It also shows the classic block
 * types (text, MCQ with per-option feedback, accordion, flip cards) so a
 * new author sees the whole range in one place.
 */
export const sampleCourse: Course = {
  schemaVersion: 1,
  id: 'demo-fire',
  title: 'Fire Emergency Response: You Are There',
  description:
    'A first-person walkthrough of a workplace fire. Learn the essentials, then live them.',
  passingScore: 80,
  pages: [
    {
      id: 'p1',
      title: 'Before the alarm',
      blocks: [
        {
          type: 'text',
          id: 't1',
          heading: 'Why this course is different',
          body: "You won't just read about fire safety — you'll experience a fire emergency in first person, make real decisions under time pressure, and use the tools you'd actually have on you.\n\nFirst, the essentials. Then you're on shift.",
        },
        {
          type: 'flipcards',
          id: 'f1',
          cards: [
            { front: 'R', back: 'REMOVE anyone in immediate danger — if safe to do so.' },
            { front: 'A', back: 'ALERT — raise the alarm and call it in on your radio.' },
            { front: 'C', back: 'CONTAIN — close doors behind you to slow the fire.' },
            { front: 'E', back: 'EVACUATE via the nearest safe exit. Never use lifts.' },
          ],
        },
        {
          type: 'accordion',
          id: 'a1',
          items: [
            {
              title: 'When should I fight a fire myself?',
              body: 'Only if it is smaller than a waste-paper bin, you have a clear exit behind you, and you are trained on the extinguisher. When in doubt — get out.',
            },
            {
              title: 'What does the radio protocol sound like?',
              body: '"This is [name] on [location]. Fire in [place]. [Number] people with me. We are moving to [exit]." Short, calm, factual.',
            },
            {
              title: 'What about people who need help evacuating?',
              body: 'Know your workplace PEEP list (Personal Emergency Evacuation Plans). Assist if safe; otherwise report their location on the radio immediately.',
            },
          ],
        },
        {
          type: 'hotspot',
          id: 'h1',
          prompt: 'Know your ground: explore the floor plan and find the four things every warden should be able to point to blindfolded.',
          image: {
            src: floorPlanSrc,
            alt: 'Simplified floor plan of Level 2: open office and meeting rooms on the left, warehouse floor in the middle, kitchen and Stairwell B on the right, Stairwell A at the top of the warehouse.',
          },
          spots: [
            {
              id: 'h1a',
              x: 35.2,
              y: 11,
              label: 'Stairwell A (east)',
              feedback: 'Your closest fire stairs from the office — but closest is not always safest. In the scenario coming up, remember there are two ways down.',
            },
            {
              id: 'h1b',
              x: 88.7,
              y: 74,
              label: 'Stairwell B and refuge point (west)',
              feedback: 'The second escape route, with a fire-rated refuge point beside it for anyone who cannot use stairs unassisted.',
            },
            {
              id: 'h1c',
              x: 56,
              y: 51,
              label: 'Extinguishers on the warehouse floor',
              feedback: 'Wall-mounted extinguishers at each pillar line. Bin-sized fire, clear exit behind you, trained — otherwise walk past them and evacuate.',
            },
            {
              id: 'h1d',
              x: 88.7,
              y: 25,
              label: 'Kitchen',
              feedback: 'The most common ignition source on this floor. If smoke is coming from here, the east side may be compromised early.',
            },
          ],
        },
        {
          type: 'mcq',
          id: 'q1',
          question: 'The fire alarm sounds while you are on the far side of the warehouse. What do you do first?',
          options: [
            {
              text: 'Finish the pallet you are wrapping — alarms are usually drills.',
              correct: false,
              feedback: 'Treat every alarm as real. Seconds matter, and "probably a drill" is how people get trapped.',
            },
            {
              text: 'Move immediately toward the nearest exit route, alerting anyone near you.',
              correct: true,
              feedback: 'Right. Move first, gather information as you go — and bring others with you.',
            },
            {
              text: 'Call your supervisor to ask whether it is a real fire.',
              correct: false,
              feedback: 'Phone trees waste evacuation time. Move first; report on the radio once you are moving.',
            },
          ],
        },
      ],
    },
    {
      id: 'p2',
      title: 'The scenario: smoke on Level 2',
      blocks: [
        {
          type: 'scenario',
          id: 's1',
          title: 'Smoke on Level 2',
          intro:
            "It's 3:40 pm on a Thursday. You're the floor warden on Level 2 with a radio on your belt. This is your point of view — what you choose is what happens. Your radio works: use it.",
          startSceneId: 'sc1',
          tools: [
            {
              id: 'radio',
              name: 'Walkie-talkie',
              icon: 'radio',
              description: 'Your two-way radio. Channel 1 reaches the Chief Warden and reception.',
              actions: [
                {
                  id: 'ra1',
                  label: 'Report: "Smoke on Level 2, east corridor"',
                  feedback:
                    '"Copy that. Fire brigade is being called. Begin evacuation of Level 2, use Stairwell B — Stairwell A is compromised."',
                  setsFlags: ['reported', 'knowsStairB'],
                  quality: 'best',
                },
                {
                  id: 'ra2',
                  label: 'Ask: "Is this a drill?"',
                  feedback: '"Negative, this is NOT a drill. Report your situation." Time is passing.',
                  quality: 'poor',
                },
                {
                  id: 'ra3',
                  label: 'Report a person needing assistance at their location',
                  feedback: '"Copy. Noted for the fire brigade — they will be first priority. Keep moving."',
                  setsFlags: ['reportedPEEP'],
                  onlyInScenes: ['sc3', 'sc4'],
                  quality: 'best',
                },
              ],
            },
          ],
          scenes: [
            {
              id: 'sc1',
              title: 'The alarm',
              narrative:
                'The evacuation tone starts mid-sentence in your team huddle. Through the glass wall you see a grey haze drifting along the east corridor ceiling. Three colleagues look at you — you are the floor warden.',
              ambient: 'Whoop-whoop of the evacuation tone. Chairs scraping. Somebody nervously laughs.',
              timerSeconds: 25,
              timerGoTo: 'sc2b',
              choices: [
                {
                  id: 'c1',
                  label: 'Grab your hi-vis vest, tell everyone "This is real, we move now."',
                  goTo: 'sc2',
                  quality: 'best',
                  feedback: 'Clear, calm, decisive. People follow certainty.',
                },
                {
                  id: 'c2',
                  label: 'Walk to the east corridor first to see how bad the smoke is.',
                  goTo: 'sc2c',
                  quality: 'poor',
                  feedback: 'You move toward the hazard — and away from the people you are responsible for.',
                },
                {
                  id: 'c3',
                  label: 'Wait for an announcement to confirm it is not a drill.',
                  goTo: 'sc2b',
                  quality: 'poor',
                },
              ],
            },
            {
              id: 'sc2',
              title: 'Moving the floor',
              narrative:
                'Your team is up. Down the hall, a dozen more people hover between desks, half-standing. The smoke haze in the east corridor is thicker now. Stairwell A is east — through the haze. Stairwell B is west, further away.',
              ambient: 'Alarm continues. A distant crackle. Someone asks "Which way?"',
              choices: [
                {
                  id: 'c4',
                  label: 'Send everyone west to Stairwell B — away from the smoke.',
                  goTo: 'sc3',
                  quality: 'best',
                  feedback: 'Longer walk, cleaner air. Never route people through smoke.',
                },
                {
                  id: 'c5',
                  label: 'Stairwell A is closer — push through, the smoke is still thin.',
                  goTo: 'sc4b',
                  quality: 'poor',
                },
              ],
            },
            {
              id: 'sc2b',
              title: 'Lost time',
              narrative:
                'Forty seconds gone. The haze is now a visible layer at head height in the east corridor and people are looking at each other instead of moving. You have lost your head start — but not your options.',
              ambient: 'The alarm feels louder. A smoke detector shrieks close by.',
              choices: [
                {
                  id: 'c6',
                  label: 'Take charge now: vest on, voice up, move everyone west.',
                  goTo: 'sc3',
                  quality: 'ok',
                  feedback: 'Late, but decisive. In a real event this delay could have mattered.',
                },
              ],
            },
            {
              id: 'sc2c',
              title: 'Too close',
              narrative:
                'Halfway down the east corridor the haze catches your throat and your eyes stream. You cannot see the far end anymore. Behind you, your floor is leaderless.',
              ambient: 'Crackling is distinct now. The alarm sounds muffled through the smoke.',
              choices: [
                {
                  id: 'c7',
                  label: 'Turn back, stay low, and lead the floor west to Stairwell B.',
                  goTo: 'sc3',
                  quality: 'ok',
                  feedback: 'Good recovery. Reconnaissance is the fire brigade’s job, not the warden’s.',
                },
              ],
            },
            {
              id: 'sc3',
              title: 'The sweep',
              narrative:
                'People are streaming toward Stairwell B. As you sweep the floor, you find Priya from Accounts at her desk — she uses crutches, and her PEEP buddy is on leave today. The stairwell is 40 metres away.',
              ambient: 'Footsteps and doors. The alarm keeps its rhythm. Priya says, calmly: "I can’t do stairs quickly."',
              choices: [
                {
                  id: 'c8',
                  label: 'Escort Priya to the Stairwell B refuge point and stay in radio contact.',
                  goTo: 'sc4',
                  quality: 'best',
                  setsFlags: ['helpedPEEP'],
                  feedback: 'Refuge points beside stairwells are designed exactly for this.',
                },
                {
                  id: 'c9',
                  label: 'Tell Priya help is coming and continue the sweep alone.',
                  goTo: 'sc4c',
                  quality: 'poor',
                },
              ],
            },
            {
              id: 'sc4',
              title: 'Refuge point',
              narrative:
                'Priya is safe at the refuge point beside Stairwell B, behind fire-rated doors. The last stragglers pass you. If you have not already, the Chief Warden needs to know exactly where she is.',
              ambient: 'The stairwell door thuds shut. The alarm is quieter in here. Priya breathes out.',
              choices: [
                {
                  id: 'c10',
                  label: 'Radio her location, close doors behind you, and descend with the last group.',
                  goTo: 'end1',
                  quality: 'best',
                  setsFlags: ['closedDoors'],
                },
                {
                  id: 'c11',
                  label: 'Descend now — reception will figure out who is missing at the muster point.',
                  goTo: 'end2',
                  quality: 'ok',
                },
              ],
            },
            {
              id: 'sc4b',
              title: 'Into the smoke',
              narrative:
                'Ten steps into the east corridor the smoke drops to chest height. Someone behind you starts coughing hard and turns back in a panic. This route is gone — and now the group is split.',
              ambient: 'Coughing. A shout of "Go back!" The crackle is very close.',
              choices: [
                {
                  id: 'c12',
                  label: 'Shout "Back! West stairs!", stay low, regroup and lead them to Stairwell B.',
                  goTo: 'sc3',
                  quality: 'ok',
                  feedback: 'You recovered it, but routing people toward smoke is the classic fatal shortcut.',
                },
              ],
            },
            {
              id: 'sc4c',
              title: 'The muster point gap',
              narrative:
                'You reach the muster point. The Chief Warden calls roll: "Priya — Priya? Anyone?" Your stomach drops. She is still on Level 2, and now the fire brigade must search for her.',
              ambient: 'Sirens arriving. Roll call names carrying across the car park.',
              choices: [
                {
                  id: 'c13',
                  label: 'Report her exact location to the fire brigade immediately.',
                  goTo: 'end3',
                  quality: 'ok',
                },
              ],
            },
            {
              id: 'end1',
              title: 'Everyone accounted for',
              narrative:
                'At the muster point the roll call comes back clean. The fire brigade goes straight to the refuge point for Priya — they knew exactly where she was because you told them. Doors you closed slowed the smoke spread to two rooms.',
              isEnding: true,
              endingType: 'safe',
              debrief:
                'Textbook warden response: decisive early movement, routed people away from smoke, escorted a colleague to a refuge point, used the radio for what it is for. The habits that made this work: move on the alarm, never route through smoke, report — don’t assume.',
              choices: [],
            },
            {
              id: 'end2',
              title: 'A nervous roll call',
              narrative:
                'Priya is safe at the refuge point — but for six long minutes nobody at the muster point knew that. The fire brigade delayed entry to re-check the floor plans. It ended well. It nearly didn’t.',
              isEnding: true,
              endingType: 'mixed',
              debrief:
                'You did the hard part — getting Priya to a refuge — then skipped the easy part that makes it count: telling someone. A refuge point only works if the fire brigade knows it is occupied. Radio first, then move.',
              choices: [],
            },
            {
              id: 'end3',
              title: 'The search',
              narrative:
                'Firefighters in breathing apparatus go back into a smoke-filled building to search for one person whose location you knew. They bring Priya out unhurt. Their risk was the cost of the minutes you saved.',
              isEnding: true,
              endingType: 'unsafe',
              debrief:
                'Never leave someone who cannot self-evacuate without either escorting them to a refuge point or immediately radioing their exact location. "Help is coming" is only true if you make it true.',
              choices: [],
            },
          ],
        },
      ],
    },
    {
      id: 'p3',
      title: 'Debrief and check',
      blocks: [
        {
          type: 'text',
          id: 't2',
          heading: 'What the scenario was really teaching',
          body: 'Every branch came down to three habits:\n\n**Move on the alarm** — certainty beats speed, and both beat waiting.\n\n**Never route people toward smoke** — the nearest exit is not always the right exit.\n\n**Report, don’t assume** — the radio call you make is the search a firefighter doesn’t.',
        },
        {
          type: 'mcq',
          id: 'q2',
          question: 'A colleague who cannot use stairs is with you when the alarm sounds. The best action is:',
          options: [
            {
              text: 'Escort them to the refuge point by the fire stairs and radio their location.',
              correct: true,
              feedback: 'Exactly — refuge plus report. Both halves matter.',
            },
            {
              text: 'Carry them down the stairs yourself.',
              correct: false,
              feedback: 'Unassisted carries injure both of you and block the stairwell. Use the refuge point unless you are trained and equipped.',
            },
            {
              text: 'Stay with them at their desk until firefighters arrive.',
              correct: false,
              feedback: 'Their desk is not fire-rated. Refuge points beside stairwells are — that is where you wait.',
            },
          ],
        },
      ],
    },
  ],
};

/** A minimal blank course for the "start from scratch" path. */
export function blankCourse(): Course {
  return {
    schemaVersion: 1,
    id: `course-${Date.now().toString(36)}`,
    title: 'Untitled course',
    description: '',
    passingScore: 80,
    pages: [{ id: 'p1', title: 'Page 1', blocks: [] }],
  };
}
