# Studio presets

These robots are the studio's own. Unlike `../serial-arm`, they are not compared against
the Python package, so they may use any joint kind.

The file name is the preset's id and stays stable; `name` is what the library shows.

| Preset | Kinematics from | Joints |
|---|---|---|
| `ur5e` | Universal Robots' published DH table, turned 180° about z | 6 revolute |
| `panda` | Franka's published modified DH table and flange | 7 revolute |
| `iiwa14` | KUKA LBR iiwa 14 R820 standard DH (360/420/400/126 mm) | 7 revolute |
| `irb120` | ABB IRB 120 datasheet DH (290/270/70/302/72 mm) | 6 revolute |
| `wam` | Modern Robotics Example 4.7, Barrett's datasheet (550/300/60 mm, 45 mm offset) | 7 revolute |
| `anthropomorphic_rrr` | Generic teaching arm (300 mm column, 300 + 300 mm links), estimates | 3 revolute |
| `planar_3r` | Generic teaching arm (250 + 200 + 150 mm links), estimates | 3 revolute |
| `planar_2r` | Generic teaching arm (300 + 250 mm links), estimates | 2 revolute |
| `puma560` | Corke's PUMA 560 standard DH, 56 mm flange, 672 mm shoulder height | 6 revolute |
| `scara` | Adept Cobra 600: Corke's `mdl_cobra600` standard DH (387 mm, 325 + 275 mm links) and 210 mm quill; joint limits from Adept's Cobra s600 guide | 3 revolute, 1 prismatic |
| `stanford_arm` | Corke's `mdl_stanford` standard DH (412 mm column, 154 mm shoulder offset, 263 mm tool), 12 to 50 in boom, joint limits and link masses | 5 revolute, 1 prismatic |
| `youbot` | KUKA youBot: Modern Robotics capstone chassis and arm geometry on a drive base | planar, 5 revolute |
| `cartesian_gantry` | A generic textbook PPP layout, not any maker's robot | 3 prismatic |
| `cylindrical_robot` | A generic textbook RPP layout, not any maker's robot | 1 revolute, 2 prismatic |
| `double_pendulum` | A teaching model, not any maker's rig: two 250 mm, 0.2 kg bars, frictionless pins | 2 revolute, unpowered and continuous |

A preset can set `home`, the joint values it starts at, in DOF order.

The library is every file here plus `../serial-arm/original_4dof.json`, shown as 4-DOF Arm. The other
`../serial-arm` files are test fixtures, and all of them must stay byte-identical.

`test/core/robot/studio-presets.test.ts` checks two things. Each DH-derived preset
matches its table at random poses to 1e-9 m. Every preset's FK and gravity torque
match MuJoCo.

The kinematics follow the sources above. Masses, gains, damping, armature and torque
limits are estimates for simulation, not vendor data, unless noted below. The joint
housings are the studio's procedural CAD, not the manufacturers' models; for those,
open the robot under CAD.

## Design data

A preset can set `design`: how its CAD is dressed, never how it moves. `toMjcf` and the
kinematics ignore it. Every field is optional, and whatever is absent is planned from
the kinematics, so a robot with no design data still gets castings.

- `paint`: named finishes. `shell` is the body colour.
- `joints`: per joint, where the flat interface sits on its axis and how big each side's
  knuckle is. Distances are metres from the joint origin.
- `links` and `base`: per body, a label, extra `shapes` to merge or cut, and `covers`,
  which are flush panels: the stretch of wall beyond a plane, in another paint.
  A shape with `crisp` keeps a true edge where it joins; `planes` makes a sharp block
  and `arch` a pointed pocket. `bolts`, `wall`, `cell` and `spheres` tune the rest.
- `section`: the lengthwise cut, for an arm whose links sit off its middle plane.

`joints.<link>.pin` is a plain pin, drawn by the bodies' own shapes, with no drive. A robot of nothing but pins has no motors:
Pick & place and Trajectory are off, Physics lets it go with no gains on it, and Motion offers Release and the fans. `bare` ends
the chain with no flange or tool. A link can set `continuous`, which takes its stops away, so `limits` only sets its slider.

`joints.<link>.slide` shapes a prismatic joint, and one with no design data gets a sensible default. A `quill` is a bar on
the child running through a guide on the parent; a `rail` is a bar on the parent with a carriage on the child. The guide is
hollow and only its end walls are bored, for the bar's whole sweep, so nothing touches at any stroke. Every slide carries a
rack along its bar, which also keys the pair against turning, driven by a motor through a worm and wheel in a pod on the guide;
`drive: false` leaves that to the robot's own `inside` hardware. A slide opens in explode until it has left its guide. `test/cad/preset-gate.test.ts`
checks every slide at both ends of its travel. `virtual` gives a joint no hardware, for a base that simply drives over the floor.

`npm run build` bakes every preset with design data into `dist/bake/<generator>/<spec>.bin`, by `scripts/bake/run.mjs`: the
meshed surfaces and hull spheres, which are what make a preset slow to open. Both hashes are in the path, so a changed preset
or generator simply misses and meshes live, and a failed bake logs `bake: FAILED` and ships without one. There are none in
`npm run dev`. Building a robot with no design data is never baked: it is one being edited, drawn as a quicker draft.

`double_pendulum`'s Motion integrates Lagrange's equations with RK4 from the pose you set, using the capsule inertias MuJoCo
compiles from the same file; `test/core/motion/double-pendulum.test.ts` holds the accelerations to MuJoCo's. Its fans start a
millionth of a radian apart at size 1, and the robot plays the run that starts exactly at your pose. Physics runs MuJoCo itself.

`iiwa14` is the first preset with design data. Its proportions are measured from MuJoCo
Menagerie's `kuka_iiwa_14` meshes at the zero pose; those meshes are not used. Its paint
is sampled from the photo in KUKA's LBR iiwa brochure. Axis ranges and maximum torques
match the same brochure's data table. Its masses total the brochure's 29.9 kg, with no
payload. The split between links is an estimate: Menagerie's link masses scaled to that
total. A chain has no fixed base mass, so the base's share rides in the moving links, and
physics sees a few kilograms more moving mass than the real arm. Its `home` is a ready
pose with the flange pointing straight down.

`puma560`'s kinematics are Corke's standard DH. Its base and joint limits come from the
same place: `base` is the manual's 672 mm shoulder height (Corke's code uses 26.45 in;
0.66 m came from the docstring's rounded 26 in), and the limits are his `qlim`. Shoulder
and elbow used to be sign-flipped against it, which let the elbow fold through the upper
arm and kept the arm from reaching his `qr`.

Its form comes from these, each for what it shows and no more:
- The Stäubli Unimation 560C arm manual's drawing, reproduced on Wikipedia's PUMA page: 735 mm
  upper arm, 226 mm behind the shoulder, 150 mm arm width, 206 mm drum, 132 mm forearm tail,
  210 mm base box, and the upper arm outboard with the forearm doubling back inside it. libkine's
  wiki lists d2 = 243.5, d3 = -93.4 mm for Armstrong, Khatib and Burdick's model, which agrees.
- RoboDK's model labelled PUMA 560, a render and not a photo, for the foot's gussets and lugs.
- Other proportions are estimates read from the photos below.

Paint is sampled from two Wikimedia Commons photos, neither confirmed as a 560. "UNIMATE PUMA
200 Robot Arm" is captioned PUMA 200 but its decal reads PUMA 500: a 500-series arm, for the
putty arm, black stripe, taupe cap and black wrist. "Victor Scheinman at MIT Museum" shows a
PUMA of unstated model, for the bronze column and base. Real machines vary and the sources
conflict on the pedestal. Those two photos, from different institutions, agree on a bronze-brown
base. UC Davis's photo, the only one labelled a Puma 560, shows it ivory like the arm, and the
Deutsches Museum's Unimate 500 PUMA is black. Bronze is kept, in a satin finish, because two
photos agree on it; the 560 belongs to the 500 series, but this is a judgement, not a fact.

The drives drawn in section are the studio's schematic units, not the machine's. UC Davis
describes six brushed DC servo motors, and Corke's model lists gear ratios of about 54 to 108,
so the real joints drive through gear trains. Where a drive sits in the section is for showing
the joint, not a record of where its motor is.

Link masses 2 to 6 are Armstrong's measured 17.4, 4.8, 0.82, 0.34 and 0.09 kg, as ROBOOP lists
them. The total is RoboDK's listed 54 kg, with no payload; the 30.55 kg left over rides on the
waist as an estimate, since a chain has no fixed base mass (Wikipedia cites the 560C manual for
about 83 kg). Torque limits are carried over from the earlier file and could not be traced to
a source, so they are estimates. Its `home` is the manual drawing's pose: upper arm up, forearm
level, flange down.

`ur5e`'s proportions are measured from MuJoCo Menagerie's `universal_robots_ur5e` meshes at
the zero pose; those meshes are not used. Footprint, working ranges, the ISO 9409-1-50-4-M6
flange and the 20.6 kg weight are Universal Robots' UR5e technical specification (May 2025).
Paint follows the photos in that sheet and UR's e-Series family image: silver tubes, mid-grey
housings, light blue caps, black seams. Link masses are UR's published DH table; the 2.9 kg
that leaves of the total rides on the shoulder as an estimate, with no payload. Torque limits
are Menagerie's 150 and 28 N m; other gains are estimates. `home` is Menagerie's keyframe
turned half a turn about the base, so the arm lies across the section plane and its caps face
the default camera.

`panda`'s proportions are measured from MuJoCo Menagerie's `franka_emika_panda` meshes at the
zero pose; those meshes are not used. Weight (about 18 kg), torque limits (87 and 12 N m) and
the ISO 9409-1-A50 flange are Franka Emika's Panda handbook (October 2018). Paint follows the
photo on page 31 of that handbook: white shells, charcoal inlay bands, a dark pilot disc, a
machined flange. Link masses are Menagerie's; the 1.94 kg that leaves of the total rides on
joint 1 as an estimate, with no payload. Gains are estimates. `home` is Franka's usual ready
pose, and its Pick & place cycle plans with no pair masked.

`scara` takes its joint limits from the maker: softstops of ±105°, ±150° and ±360° in Table 7-4 of Adept's user's guide. That
guide is the Cobra s600's, the nearest maker's document we found for this arm. Corke's `mdl_cobra600` gives ±50° and ±88° for
J1 and J2, "hardstop limits included"; those are the toolbox's values, not used here. The 210 mm stroke matches both. Its
41 kg weight is that guide's, with no payload. The split between links is an estimate, and the base's share rides in the links.
The guide's Figure 7-1 prints 387, 342, 177 and 888 without saying what each measures. We read 387 and 177 as the flange at the
two ends of the stroke, which Corke's table confirms, and 342 as the top of the base, an estimate. We could not tell what 888
measures, perhaps the clearance the cable needs, so the tower and conduit follow the photos' proportions and top out near 0.8 m. The forms come from a RoboDK render of the s600 and a photo of the
eCobra 600: the tower over the quill and the arched conduit are family traits of those two, not measured on a Cobra 600, and
every other height, the link forms and the paint are estimates. The drive under the outer cover is our own layout of what the
type uses, two motors belted to the quill, so J4's motor lives there and the flange has no drive of its own.

`stanford_arm` keeps a3 = 0, as in Corke's MATLAB `mdl_stanford`; his Python `Stanford.py` has a3 = 0.0203, the PUMA 560's value,
in a class whose docstring still says Puma560, so do not "correct" it. The boom runs 12 to 50 in. Its length of about 1.04 m, the
three-stage wrist (a can, an open yoke round it, a cylinder from the yoke's plate) and all other forms are estimated from a photo
of the arm at Stanford, which is also where the paint is sampled. Corke's 263 mm tool is split here into 100 mm of link and 163 mm
of tool, which leaves the tip where his table has it. Its link masses are Paul's (1981), as Corke lists them. Torques and gains
are estimates.

`youbot` takes its geometry from the Modern Robotics capstone: T_b0, M_0e, the body screw axes, and the wheels at l = 0.235,
w = 0.15, r = 0.0475 m, with {b} 0.0963 m above the floor. `test/core/robot/studio-presets.test.ts` checks the product of
exponentials to 1e-9. The capstone assumes no joint limits; the limits, efforts and arm masses are the `youbot_description` ROS
package's, with signs turned to the capstone's axes. The base's 20 kg is Sheffield Robotics' figure, and with arm link 0 it makes
the `drive` link's mass. The planar joint's 2 m range is the studio's, not a limit of the machine. The shell's length and ground
clearance follow published 531 mm and 15 mm figures; its form is estimated from photos, which the paint is also sampled from.
What is inside the chassis is our own layout. Gains, damping and armature are estimates.

`cartesian_gantry` and `cylindrical_robot` are generic. No maker's data stands behind them: every dimension, stroke, mass and limit
is an estimate chosen to show the type.

`irb120`'s proportions are measured from the `armor-abb-irb120` meshes at the zero pose; those
meshes are not used. Its 180 x 180 mm base and 25 kg are ABB's IRB 120 data sheets, and its axis
ranges match ABB's product specification 3HAC035960-001 (revision H, 2013) and the data sheet.
Colour is ABB Graphite White. That rests on search extracts of a later revision of the
specification and of a data sheet configuration, which show it as the standard colour; those two
were seen only as extracts, not opened. Revision H, which was opened, lists only ABB Orange and
white, and ABB's data sheet photo shows a white arm. The value is the RAL 7035 the paint table
uses for Graphite White, lightened a little to match that photo, so it is an estimate; RAL 7035
comes from an ABB IRB 6700 document, not an IRB 120 one. Link masses are the earlier file's
estimates; the 13.07 kg that leaves of the total rides on axis 1, with no payload. Torque limits
and gains are estimates. `home` is ABB's zero pose with the flange turned down.

`wam` is Barrett's 7-DOF WAM. Its kinematics are Modern Robotics Example 4.7: L1 = 550, L2 = 300,
L3 = 60 and W1 = 45 mm, axes 1, 3, 5, 7 along z and 2, 4, 6 along y at zero. Barrett's datasheet
(September 2023) agrees, with 550, 850 and 910 mm above the shoulder and a 45 mm common offset.
That datasheet also gives the 346 mm shoulder height, the 186 mm from there to the base block,
the 280 x 220 mm footprint, the 348 mm width across the side housings, Ø89 mm tubes and the
27 kg total. Joint limits are from arXiv 1707.04820, Table 3, a third-party paper that disagrees
with itself by 0.1 rad on joint 2 and has not been checked against Barrett's own material, so
treat them as provisional. The split of the 27 kg, torque limits and gains are estimates, with no
payload. Paint is sampled from the photo in the book's Figure 4.8; the wrist's bronze is that
photo's, and other WAMs may differ. Proportions without a figure are read from that photo and
Barrett's drawing. The real arm is driven by cables from motors in the base and upper arm; the
drives drawn in section are the studio's schematic units. `home` is an estimate of a ready pose
with the flange pointing down.

`anthropomorphic_rrr`, `planar_3r` and `planar_2r` are generic teaching arms, named by type: no
maker stands behind them, and every dimension, limit, mass, torque and gain is an estimate
chosen to teach. The anthropomorphic arm has a 300 mm column and 300 + 300 mm links. The planar
arms have 300 + 250 mm and 250 + 200 + 150 mm links, stacked flat over a base plate, with their
axes vertical so they move in one horizontal plane. Each has its own colour, blue, green and
orange, chosen for the class and not taken from any machine. All three end in a 40 mm pen tip
on a bare flange and not a gripper. A 3R arm has no wrist, so its tool cannot stay upright as it
moves, and a planar arm cannot descend, so neither could really pick anything up; they report no
Pick & place layout rather than carry a gripper they cannot use.

The 4-DOF Arm is `../serial-arm/original_4dof.json`, which stays byte-identical because it is a
Python parity fixture. How it is dressed lives in `../designs/original_4dof.json`, which
`src/app/presets/load.ts` adds to it: display only, with no change to its links or kinematics. Its
look and colours come from the SolidWorks render in the 4-DOF study's own repository,
batuhantoker/4dof-robotic-arm: red base, grey column, copper upper link, gold lower link, white
spindle. Link lengths are that study's Laz, Lax, Lb and Lt of 55, 50, 100 and 90 mm. Sizes the study
does not give are estimates read from that render, and the elbow's fork is an estimate of how a
yaw and a pitch at one point could be built. Masses, limits and gains stay as the study has them.
