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

You build an arm from a catalogue of joints, or open a real robot's CAD. The studio
poses it, explains its kinematics with live numbers, simulates it in MuJoCo, and takes
it apart teardown-style. MuJoCo is the official WebAssembly build (`@mujoco/mujoco`),
so everything runs client-side.

**Try it now at [robotics-studio-one.vercel.app](https://robotics-studio-one.vercel.app).** It needs no install and no
account, and runs in any modern browser with WebGL.

## A look inside

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/media/hero.jpg" alt="A six-joint arm posed in the studio with live joint torques and dexterity">
      <b>Pose and inspect.</b> Every joint shows its angle and its torque against the motor
      limit. Dexterity and the tool pose update live, and FK is checked against MuJoCo.
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
      <b>Teardown.</b> Glass housings show the drives inside. Explode opens every joint
      along its own axis.
    </td>
    <td width="50%" valign="top">
      <img src="docs/media/isolate.jpg" alt="An isolated strain-wave actuator with its bill of parts and callouts">
      <b>Bill of parts.</b> Isolate a module to list its parts by layer, with callouts.
      This one is the shoulder actuator: stator, windings, magnet rotor, encoder.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/media/workspace.jpg" alt="The reachable workspace shell sampled around the arm">
      <b>Workspace and limits.</b> The reachable shell is sampled in joint space and
      coloured by dexterity, torque, joint-limit margin or reach. The summary gives
      volume, reach and the near-singular share.
    </td>
    <td width="50%" valign="top">
      <img src="docs/media/cad.jpg" alt="Franka Emika Panda CAD loaded in the studio">
      <b>Real robot CAD.</b> The studio loads Menagerie, ARMOR-gallery and SolidWorks
      robots and extracts their serial chain for the same math. Shown: Franka Emika Panda
      from MuJoCo Menagerie (Apache-2.0).
    </td>
  </tr>
</table>

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

- **Top bar:** the robot's name opens the library, and the modes sit in the middle.
  On a phone, one button opens every mode as a card.
- **Under the robot:** a single bar for the current mode, such as motion presets,
  trajectory stops, Pilot keys and hands, or pick and place.
- **Top right of the stage:** robots on the stage (add up to four), the View menu
  (looks, cutaways, explode, overlays, isolate a part) and the surroundings.
- **Side panels** (bottom sheets on phones): Robots and Build on the left; Live, Math
  and Analysis on the right. Analysis shows the current mode's tools.
- **`?` opens the guide:** a short recipe for each task, plus the shortcuts. It opens
  by itself on a first visit.

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
- **Motion.** One-click motions matched to the loaded robot:
  - circle, figure 8 and pick-and-place for arms;
  - trot, walk or tripod gaits for legged robots;
  - march, squat, wave and reach for humanoids;
  - drive or spin for wheeled and aerial robots;
  - a joint wave for anything.
- **Teardown.** The View menu (the eye over the stage) switches between solid, glass and section views.
  - The explode control opens each joint along its own axis.
  - Isolating a module shows its bill of parts, layered callouts with leaders, and a
    load ring that glows with |τ|/τ_max.
  - Left idle for 25 seconds, the page tours itself. Any input hands control back.
- **Surroundings.** The gear on the viewport picks a backdrop (studio, cyclorama, dusk,
  dark, blueprint), a floor (grid, seamless, polished, tiles, none) and a setting: open
  floor, a desk the robot is bolted to, or a small work cell with a safety fence and a
  conveyor. The setting is scenery; the robot is not checked against it.
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
- **Analysis tab.**
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
src/ui/        brand, panels: library, builder, live, math, analysis, motion, teardown HUD
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
