# Ideas — MTB Skills Assessment App

Raw brainstorm capture. No phase commitment. Promote to GitHub issue when ready to discuss seriously.

---

## 2026-06-06

### Trail Network & Ride Plan Checker
Coach builds a local trail network — a list of trails with name, rating (green/blue/black/double black), and required skill minimums (Body Position, Braking, Cornering — same scale as rubric). Trails also carry a **seasonal condition adjustment**: e.g. loose and dry = effectively harder, raise minimums by 1. Coach loads a ride plan (ordered list of trails for a practice or race day) and the app flags any athletes who are below the required skill level for any trail on the plan.

**Details worth capturing:**
- Trail minimums follow the same BP/Bk/Cn format as the rubric (e.g. 3-3-2)
- Seasonal adjustment is a modifier on the minimum, not the trail rating itself
- Conditions examples: loose/dry (+1), wet roots (+1 Braking), hardpack (no adjustment)
- Ride plan = ordered trail list; app shows per-athlete pass/fail per trail
- In a later phase, Head Coach / Team Director sets or approves trail minimums (not individual coaches)
- Could integrate with the Phase 4 multi-tenant backend — league-wide trail library, team-specific adjustments

**Open questions:**
- Who maintains the trail list? (coach-entered in Phase 1, HC/TD in later phase)
- Is the trail library per-team or shared across the league?
- Does the app need to know trail order / sequence, or just flag any trail on the plan?

---

### App sharing and promotion
- Add a QR code in app settings pointing to github pages url
- consider a kill switch.  Allow the app to be shared but need a way to prevent it from being used fully for free or copied/reverse engineered
- add an about section in settings below share qr.  Describe how the app is used for a practice and a brief roadmap of what is coming.  Highlight that while useful for a ride pod to track practice, it is more about the skill tracking
- Will used for promotion of app and skills assessment at NICA national conference next week.

### Swipe motions and single click entries
- simplify opening full athlete card.  Once expanded on roster, swipe left opens full card.  On full card, swipe right goes back to roster with athlete collapsed
- on roster, clicking a level records observation without a button click. remove record observation button.  Will result in inability to record observation of multiple skills as a single entry but we're not using the data that way.


### Athlete Trading *(complete — Phase 1c)*
Allow two coaches to exchange athletes.  E.g., athlete moves up to a higher skill/faster group, or moves down on a rest day.  Could be a QR code encoding athlete detail to load on other coaches roster.

### Athlete Info *(complete — Phase 1c)*
Any special medical requirements like Epi pen or insulin.  Parent contact info for emergencies.  When an athlete is traded (see above) would include athlete info so a new coach working with athlete has necessary info.  Make an info icon but limit

### practice roster
show athletes from roster, record attendance for the practice.  Allow temporary adds when unable to receive trading card from normal coach.  Allow sorting on the roster, including show attending riders on top and non-attending on off the bottom.  Also, allow coaches on roster.  Level 3 coach should be evaluating Level 1 and 2 coaches.1

### Onboarding Screen
First-launch experience for brand new users. Set expectations before they hit the blank roster: what the app does, how the assessment flow works (observe → confirm → trail readiness), and a prompt to set up their coach profile and team. Reduces confusion for coaches who receive the URL cold with no context.

### Education Screen — Digital Field Guide + Rubric *(shipped — Phase 1b)*
In-app rubric reference. Digital version of the field card layout (skill → level → when it breaks → what breaks). Each card links to the long-form reference detail for coaches who want more context. Also the entry point to skill-level video clips (Phase 1+). Keeps the rubric accessible during a ride without paper cards.
- Card view matches the printed field card format for familiarity
- "More detail" tap expands or links to full reference doc level
- Video link per level when clips are available (Phase 1+)
- No data model impact — reads from `src/rubric.js` only

### Video Reference per Skill Level *(promoted to ROADMAP.md Phase 1+)*
YouTube-linked clips per skill/level on rubric cards. Tim's existing video assets are the source.

### Monetization Path *(noted in ROADMAP.md)*
- BICP (for-profit skills org) as alternative to NICA if app becomes commercializable.  
- Better plan, make practice app sellable to teams and leagues

