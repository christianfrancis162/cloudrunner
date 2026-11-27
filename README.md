# cloudrunner

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/christianfrancis162/cloudrunner/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/christianfrancis162/cloudrunner/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

Cloudrunner is a 3D arcade flight game set in Kestrel Valley, a golden-hour alpine valley with Kestrel Field airfield, Lake Solenne and the Kestrel Hut refuge: fly through 7 sorties — Flight School, Ring Run, Cargo Drop, Rescue Pickup, Timed Sprint, Storm Run and Precision Landing — manage fuel and airframe damage, read the live wind, pick your hour from dawn to night, and land back on the runway for the touchdown bonus.

## Missions

- **Flight School** — first flight, with a coach: throttle up, lift off, climb, turn, thread ring 1, land. Every lesson step pays +100.
- **Ring Run** — fly through all 8 glowing rings, then land.
- **Cargo Drop** — drop a supply crate into each of the 3 marked meadows (C to drop; closer to the centre scores more), then land.
- **Rescue Pickup** — land on the Kestrel Hut pad, hold still for 3 s while the stranded hiker boards, then fly home and land.
- **Timed Sprint** — all 8 rings against a 2:30 par; every second under par pays +5.
- **Storm Run** — all 8 rings in a valley storm: 14 m/s gusts, low cloud and rain, against a 2:00 par; every second under par pays +6.
- **Precision Landing** — night landing, by the book: fly the gold approach gate on the 3° glide slope, then land in the touchdown zone. Graded A–F on vertical speed, centreline and speed; a perfect landing pays +400.

## Weather

A live wind blows across the valley — a steady breeze most days, gusting in the storm. It drifts the plane and nudges the nose into the wind, so the pilot corrects for it or loses rings. The HUD wind gauge reads speed and direction, the windsock by the runway points downwind, and the storm brings rain and a low dark cloud layer.

## Hangar

Three planes, three ways to fly: the **Kestrel K-2 "Cloudrunner"** (nimble, tight turns, 85 fuel), the **Albatross A-4 "Steadywing"** (steady, slow turns, 135 fuel, 105 top speed) and the **Falcon F-3 "Dart"** (twitchy hot rod, quickest to speed, 70 fuel). Pick on the title screen; the choice changes the flight model.

## Pilot Log

Every sortie is recorded — mission, plane, score, time, rings, landing or crash. The records page shows best score and best time per mission, total flights and hours, and the recent flights table. Clear it with a double-press of CLEAR LOG.

## Time of Day

Four hours over the same valley — Dawn, Golden Hour, Dusk and Night — picked on the title screen and remembered between visits. Night flying is real flying: the runway edge lights and the PAPI glow, the landing light rides the nose, and the pilot lands by instruments and light. Precision Landing always flies at night.

## PAPI & Night Flying

A four-light PAPI beside the south threshold reads the 3° glide slope live — two white, two red on the slope; white when high, red when low — and the HUD spells out the reading (ON SLOPE, TOO HIGH, TOO LOW). The same slope is what Precision Landing grades against, so the lights and the score agree.

## Valley Tour

The seven sorties as one tour: fly them in order, earn a bronze, silver or gold medal per sortie from the score, and watch the tour total grow. The title screen shows every medal, the best score per sortie, and the bar for the next medal up.

## Achievements

Fourteen feats on record — First Ring, Bullseye, Storm Survivor, Night Owl, Ace Landing, High Roller, Graduate and more — toasted the moment they happen and kept on the title screen.

## Minimap

A live top-down map of the valley in the corner of the HUD: the runway, Lake Solenne, the ring course with the next ring pulsing gold, the drop zones, the rescue pad, and the plane as an arrow on its heading.

## Damage

Hard touchdowns, terrain grazes and rough bounces damage the airframe: handling gets heavy, top speed falls, fuel burns faster, and at 100% damage the airframe gives out. Fly smooth or fly home wounded.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 — fly with WASD / arrow keys, Shift and Ctrl for throttle, mouse to steer, Space for the airbrake.

---

<sub>Entered on [make.fun](https://make.fun/?ref=xt27jkwb&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
