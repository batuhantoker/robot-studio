<p align="center">
  <img src="src/ui/brand/mark.svg" width="84" alt="Robot Studio logo">
</p>

<h1 align="center">Robot Studio</h1>

<p align="center">
  Build, analyze, simulate and take apart serial robots, in the browser.<br>
  Live kinematics, MuJoCo physics compiled to WebAssembly, and teardown views of the hardware. There is no server.
</p>

<p align="center">
  <a href="https://robotics-studio-one.vercel.app"><b>Open the live studio</b></a>
  &nbsp;·&nbsp; <a href="#run-it-locally">Run locally</a>
</p>

<p align="center">
  <a href="https://robotics-studio-one.vercel.app"><img src="https://img.shields.io/badge/live%20demo-robotics--studio--one.vercel.app-d6182b?style=flat-square&logo=vercel&logoColor=white" alt="Live demo"></a>
  <a href="https://github.com/batuhantoker/robot-studio/actions/workflows/ci.yml"><img src="https://github.com/batuhantoker/robot-studio/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/TypeScript-strict-16181b?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/three.js-r187-16181b?style=flat-square&logo=threedotjs&logoColor=white" alt="three.js">
  <img src="https://img.shields.io/badge/MuJoCo-3.17%20WASM-d6182b?style=flat-square" alt="MuJoCo 3.17 WASM">
  <img src="https://img.shields.io/badge/Vite-8-16181b?style=flat-square&logo=vite&logoColor=white" alt="Vite">
</p>

<p align="center">
  <a href="https://robotics-studio-one.vercel.app"><img src="docs/media/simulation.gif" width="100%" alt="MuJoCo drives a six-joint arm through a quintic trajectory while applied torque and tracking error plot live"></a>
  <br><sub>MuJoCo (WebAssembly) drives the <code>spatial_6link</code> preset through a quintic trajectory; applied torque and tracking error plot live. <a href="https://robotics-studio-one.vercel.app">Try it in your browser.</a></sub>
</p>

You build an arm from a catalogue of joints, or open one of 147 robots: arms,
humanoids, legged and wheeled machines, many from real CAD. The studio poses them,
explains their kinematics with live numbers, simulates them in MuJoCo, drives them
around a workshop, and takes them apart teardown-style. MuJoCo is the official
WebAssembly build (`@mujoco/mujoco`), so everything runs client-side, on a desktop or
a phone.

**Try it now at [robotics-studio-one.vercel.app](https://robotics-studio-one.vercel.app).** It needs no install and no
account, and runs in any modern browser with WebGL.

## A look inside

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/media/hero.jpg" alt="A six-joint arm posed in the studio with live joint torques and dexterity">
      <b>Pose and inspect.</b> Every joint shows its angle and its torque against the motor
      limit. Dexterity and the tool pose update live, and FK is checked against MuJoCo.
      The modes sit along the top; the current mode's controls sit under the robot.
    </td>
    <td width="50%" valign="top">
      <img src="docs/media/math.jpg" alt="The math tab with the chain product, Rodrigues rotation and a DH table">
      <b>Live math.</b> The chain product, Rodrigues' formula, FK, a DH table derived from
      the axis geometry, and the Jacobian SVD, all evaluated at the current pose.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/media/teardown.jpg" alt="Glass view with every joint exploded along its own axis">
      <b>Teardown.</b> The View menu (the eye over the stage) switches to glass housings that
      show the drives inside, and Explode opens every joint along its own axis.
    </td>
    <td width="50%" valign="top">
      <img src="docs/media/isolate.jpg" alt="An isolated strain-wave actuator with its bill of parts and callouts">
      <b>Bill of parts.</b> Isolate a module to list its parts by layer, with callouts.
      This one is the shoulder actuator: housing, stator, windings, magnet rotor,
      strain-wave gear.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/media/workspace.jpg" alt="The reachable workspace shell sampled around the arm">
      <b>Workspace and limits.</b> The reachable shell is sampled in joint space and
      coloured by dexterity, torque, joint-limit margin or reach. The Analysis tab follows
      the mode: here it gives volume, reach and the near-singular share.
    </td>
    <td width="50%" valign="top">
      <img src="docs/media/cad.jpg" alt="Franka Emika Panda CAD loaded in the studio">
      <b>Real robot CAD.</b> The studio loads Menagerie, ARMOR-gallery and SolidWorks
      robots and extracts their serial chain for the same math. Shown: Franka Emika Panda
      from MuJoCo Menagerie (Apache-2.0).
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/media/hands.jpg" alt="A Unitree G1 humanoid at a lab bench in Pilot mode with the hand controls open">
      <b>Drive, reach and grab.</b> Pilot walks legged robots and drives wheeled ones. On a
      humanoid, Hands steers each hand to a part on the bench, grips it, and carries it off.
      Shown: Unitree G1 in the lab setting.
    </td>
    <td width="50%" valign="top">
      <img src="docs/media/stage.jpg" alt="Three arms side by side on one stage with the On stage panel open">
      <b>Several robots on one stage.</b> Add up to four, place each by arrows or by
      millimetres and degrees, and click any of them to take control.
    </td>
  </tr>
</table>

<p align="center">
  <img src="docs/media/phone.jpg" width="100%" alt="The studio on a phone: the stage with its bar, the mode cards, the Live sheet, and a walkthrough step">
  <br><sub>On a phone: the stage with the mode's bar, every mode as a card, panels as bottom sheets, and the walkthrough.</sub>
</p>

## Run it locally

To skip the install, open the same build at [robotics-studio-one.vercel.app](https://robotics-studio-one.vercel.app).

```bash
npm install
npm run dev              # http://localhost:5173
npm run robots:fetch     # optional: real robot CAD, kept on this machine (see Robot CAD)
```

`npm test` runs the cross-validation suite, `npm run typecheck` checks types, and
`npm run build` writes a static site to `dist/`.

## Getting around

<img src="docs/media/tour.jpg" width="100%" alt="The walkthrough spotlighting the mode switch in the top bar">

- **Top bar:** the robot's name opens the library, and the eight modes sit in the
  middle: Pose, Motion, Pilot, Pick & place, IK, Trajectory, Physics, Workspace. On a
  phone, one button opens every mode as a card.
- **Under the robot:** one bar for the current mode, such as motion presets,
  trajectory stops, Pilot keys and hands, or pick and place.
- **Top right of the stage:** the robots on the stage (up to four), the View menu
  (looks, cutaways, explode, overlays, isolate a part) and the surroundings.
- **Side panels** (bottom sheets on phones): Robots and Build on the left; Live, Math
  and Analysis on the right. Analysis shows the current mode's tools. `[` and `]` fold
  the panels to a rail of icons.
- **`?` starts a walkthrough:** it spotlights each of these on the real screen, one
  line at a time, switching modes and opening menus to show them. Other keys: `/`
  searches the robots, and `↑ ↓` steps through them.

## What it does

- **Build robots from a joint catalogue.** There are six joint kinds: revolute,
  prismatic, cylindrical (slide plus turn), universal (two intersecting hinges),
  spherical (three intersecting hinges) and planar (two slides plus a turn).
  - Each kind expands into elementary hinge and slide DOFs, so FK, the Jacobian, DH,
    IK, statics and MuJoCo treat them all the same way.
  - Each kind has its own procedural CAD module: a cobot actuator with stator,
    windings, magnet rotor, strain-wave gear, bearings and encoder; a ball-screw axis;
    a telescoping sleeve; a Cardan yoke; a ball and socket; an XY stage.
  - Robots are saved in the browser and export as Python JSON, studio JSON or MJCF.
- **15 presets, ready to pose and edit.**
  - Five real arms are built from their published DH tables, and a test checks each
    against its table: UR5e, Franka Panda, KUKA iiwa 14, ABB IRB 120 and PUMA 560.
  - Classic layouts: a SCARA and the Stanford arm with its telescoping boom.
  - Newer machines: a home-robot mobile manipulator, LeRobot's SO-101 and a
    humanoid arm with spherical shoulder and wrist.
  - Sources are listed in [`presets/studio`](presets/studio/README.md).
- **Humanoids and multi-limb robots.** Every limb is live. The focus picker in the top
  bar chooses which limb the math explains, and whole-body IK moves several end
  effectors at once.
- **Pilot.** Drive a legged or wheeled robot with `W A S D` (`Q E` side-steps, `Shift`
  hurries, `C` swaps the follow and look-out cameras), or with an on-screen stick on a
  phone. It stops short of the scenery.
  - Hands, on humanoids: pick a hand, move its target with the pad or `I J K L` /
    `U O`, grip with `Space`, and carry the part off; `R` rests the hands.
  - Hand moves on keys `1`–`4`: wave, reach, work, lift.
- **Pick and place.** Choose the pick and place spots by dragging arrows or clicking the
  floor or a bench; the plan says what blocks it. It starts from a loose part in reach.
- **Several robots on one stage.** Up to four, each placed in the stage frame; click one
  to control it. One MuJoCo heap holds them all, so the page caps the count.
- **Motion.** One-click motions matched to the loaded robot:
  - circle, figure 8 and pick-and-place for arms;
  - trot, walk or tripod gaits for legged robots;
  - march, squat, wave and reach for humanoids;
  - drive or spin for wheeled and aerial robots;
  - a joint wave for anything.
- **Teardown.** The View menu (the eye over the stage) switches between solid, glass
  and section views, and holds the looks (studio, clay, technical, materials) and the
  overlays (axes, CoM, velocity ellipsoid, trail, workspace).
  - The explode control opens each joint along its own axis.
  - Isolating a module shows its bill of parts, layered callouts with leaders, and a
    load ring that glows with |τ|/τ_max.
  - Left idle for 25 seconds, the page tours itself. Any input hands control back.
- **Surroundings.** The gear on the viewport picks a backdrop (studio, cyclorama, dusk,
  dark, blueprint), a floor (grid, seamless, polished, tiles, none) and a setting: open
  floor, a desk, a lab bench, a work cell with a fence and a conveyor, a machine shop,
  or a warehouse. Each setting has loose parts to pick up, and its conveyors and
  vehicles can run.
- **Math tab.** Every section is evaluated at the current pose:
  - the chain product and Rodrigues' formula;
  - forward kinematics;
  - a DH table derived from the axis geometry (skew, intersecting, parallel and
    coincident cases) and verified against FK;
  - the geometric Jacobian with SVD, manipulability and condition number;
  - the damped-least-squares IK trace;
  - gravity statics as Jacobian-transpose sums;
  - the quintic profile;
  - the original Kane closed form, shown for `original_4dof`;
  - the equations of motion and the control law.
- **Analysis tab.** It shows the current mode's tools and lists the others as cards.
  - IK against a draggable target, with the solver iterations replayed.
  - Quintic trajectories with joint, speed and torque profiles. Render one pass to a
    16:9 MP4 (720p to 4K, 30 or 60 fps), drawn offline frame by frame with AO and
    supersampling, or export the samples (t, q, qd, qdd, tool path) as CSV or JSON.
  - Live MuJoCo tracking with requested and applied torque, tracking error and
    saturation.
  - Workspace and limits, as described above.
- **Real robot CAD.** Imported robots render from MuJoCo's compiled meshes, and their
  serial chain is extracted for the same math. In glass view each body shows MuJoCo's
  equivalent-inertia box.
  - **Make editable** turns a CAD robot into a *kinematic twin*: a studio spec with
    the same FK, built from zero-pose axes and anchors (product of exponentials).
  - The real meshes stay bound to the twin's links. Changing a length slice-stretches
    only the middle of the link, so housings keep their shape. Thickness scales the
    cross-section.
  - Links whose joint kind or direction you change, and links you add, fall back to
    procedural modules.

## Robot CAD

`npm run robots:fetch` downloads robot models into `public/robots/` from three
sources:

- [MuJoCo Menagerie](https://github.com/google-deepmind/mujoco_menagerie) arms, at a
  pinned commit.
- The ARMOR gallery's upstream repositories.
- Montaj1, the SolidWorks assembly from the
  [4-DOF study](https://github.com/batuhantoker/4dof-robotic-arm). It is fetched by
  sparse checkout and converted with that repo's `python/scripts/preview_cad.py`.

`npm run robots:verify` compiles every model from exactly its listed files.

- Each robot keeps its upstream LICENSE, and the manifest records each robot's license.
- Models with no upstream license are marked local-use only.
- Fetched files are gitignored, so nothing third-party is committed.

### The published robot pack

The live site loads its 116 CAD robots from a pack on GitHub Pages, not from the
Vercel build. The pack's [attribution page](https://batuhantoker.github.io/robot-studio/)
lists every robot with its license and upstream source.

- [`robots-pages.yml`](.github/workflows/robots-pages.yml) runs `robots:fetch`,
  `robots:verify` and `npm run robots:pack` on GitHub Actions.
- The pack holds only robots whose upstream states a license, plus Montaj1, the
  author's own CAD. Each ships with its LICENSE.
- The 17 robots whose upstream states no license stay local-only.
- Every file is gzipped: about 520 MB instead of 1.4 GB, under Pages' 1 GB limit. The
  studio inflates the files in the browser.
- Production builds point at the pack through `VITE_ROBOTS_BASE` in `.env.production`;
  `npm run dev` keeps reading `public/robots/`.
- The workflow runs on changes to `scripts/robots/` or by hand
  (`gh workflow run robots-pages.yml`).

## What is verified, and what is approximate

Tests in `test/` compare against MuJoCo WASM and against ground truth recorded from
the Python package in the [4-DOF study](https://github.com/batuhantoker/4dof-robotic-arm).
That ground truth is committed as `test/fixtures/python.json`, so the tests need no
Python. `npm run fixtures` regenerates it by installing a pinned
`four-dof-arm[simulation]` with uv.

| Check | Tolerance |
|---|---|
| FK, joint positions, position Jacobian vs `SerialArm`, all presets | 1e-12 |
| MJCF writer vs `SerialArm.to_mjcf()` | byte-identical |
| Schema validation vs `SerialArm.from_dict` (18 cases) | same accept/reject |
| Quintic sampling vs `analyze()` | 1e-12 |
| DLS IK vs `inverse_kinematics` from the same start | 1e-6 |
| Chain FK and gravity torque vs MuJoCo, every joint kind | 1e-12 / 1e-9 |
| DH extraction vs chain FK, presets plus 200 fuzzed chains of every kind | 1e-9 |
| Kinematic twin vs source chain, 150 fuzzed chains with fixed rotations | 1e-12 |
| `TrackingSim` vs Python `run_simulation` (MuJoCo 3.12 vs WASM 3.17) | 1e-6 rad, 1e-5 N·m |
| Kane closed form vs legacy `Robot4DOF` FK | 1e-9 mm |

The approximations match the Python package's:

- Studio robots use primitive capsule inertias and example gains and torque limits.
- All contacts are disabled.
- Workspace sampling is uniform in joint space, not a certified volume.
- IK failure does not prove a target is unreachable.

Kinematic twins match FK exactly. Their physics uses the twin's capsule model and
default 50 N·m limits, not the real robot's inertias. Imported CAD robots show
kinematics and statics from their own MJCF inertias. Live tracking runs on studio and
twin robots.

## Layout

```
src/core/      math with no DOM: math/, robot/ (schema, joint kinds), chain/, dh/,
               solvers/, analysis/, trajectory/, motion/, mjcf/, legacy/
src/physics/   MuJoCo WASM runtime, model extraction, tracking control
src/cad/       materials, parts (actuators per joint kind, links, effectors, base),
               registry, assemblies (procedural, imported, hybrid twin)
src/scene/     stage, overlays (axes, CoM, ellipsoid, trail, workspace, IK target),
               teardown (cutaway, explode, ink)
src/ui/        shell (top bar, modes, side panels, phone sheets, walkthrough), styles,
               stage menus (view, surroundings, on stage), panels: library, builder,
               live, math, analysis, and the mode bars: motion, pilot, task, trajectory
src/app/       state, controllers (modes, tour), robot sessions, bootstrap
presets/       example serial-arm specs, vendored from the 4-DOF study
scripts/       fixture generation and robot fetch/verify
docs/media/    README screenshots and the simulation clip
```

To add a new kind of joint hardware, write a `JointModuleBuilder` in
`src/cad/parts/actuators/` and register it in `src/cad/registry/joint-modules.ts`.

## Deploying

`npm run build` produces a static site. It needs no special headers, because it uses
the single-threaded WASM build. `vercel.json` sets up the build, so importing the repo
into Vercel needs no other settings. The live site,
[robotics-studio-one.vercel.app](https://robotics-studio-one.vercel.app), redeploys from `main` on every push. The site is static, with no functions, so the
free Hobby plan covers it.

Robot CAD is not part of the Vercel build. The deployed studio loads it at runtime from
the [published robot pack](#the-published-robot-pack) on GitHub Pages, which is also
free for public repositories.
