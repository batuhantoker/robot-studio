# Studio presets

These robots are the studio's own. Unlike `../serial-arm`, they are not compared against
the Python package, so they may use any joint kind.

| Preset | Kinematics from | Joints |
|---|---|---|
| `ur5e` | Universal Robots' published DH table, turned 180° about z | 6 revolute |
| `panda` | Franka's published modified DH table and flange | 7 revolute |
| `iiwa14` | KUKA LBR iiwa 14 R820 standard DH (360/420/400/126 mm) | 7 revolute |
| `irb120` | ABB IRB 120 datasheet DH (290/270/70/302/72 mm) | 6 revolute |
| `puma560` | Corke's PUMA 560 standard DH, 56 mm flange, 0.66 m pedestal | 6 revolute |
| `scara` | Epson LS6-B602S proportions: 325 + 275 mm arms, 200 mm quill | 3 revolute, 1 prismatic |
| `stanford_arm` | Scheinman's 1969 Stanford arm: 412 mm column, 154 mm shoulder offset | 2 revolute, 1 prismatic, 1 spherical |
| `mobile_manipulator` | A home-robot layout: drive base, lift mast, telescoping arm, wrist | planar, 2 prismatic, 3 revolute |
| `so101` | Zero-pose anchors and axes of MuJoCo Menagerie's `so101.xml` | 5 revolute |
| `humanoid_arm` | Adult arm proportions: 300 mm upper arm, 270 mm forearm | 2 spherical, 1 revolute |

`test/core/robot/studio-presets.test.ts` checks two things. Each DH-derived preset
matches its table at random poses to 1e-9 m. Every preset's FK and gravity torque
match MuJoCo.

The kinematics follow the sources above. Masses, gains, damping, armature and torque
limits are estimates for simulation, not vendor data. The joint housings are the
studio's procedural CAD, not the manufacturers' models; for those, open the robot
under CAD.
