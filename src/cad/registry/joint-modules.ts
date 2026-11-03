/** Joint kind → CAD module. Register a builder here to add a new kind of joint hardware. */
import type { JointKind } from '../../core/robot/schema/types';
import { cylindricalModule } from '../parts/actuators/cylindrical';
import { linearModule } from '../parts/actuators/linear';
import { planarModule } from '../parts/actuators/planar';
import { rotaryModule } from '../parts/actuators/rotary';
import { sphericalModule } from '../parts/actuators/spherical';
import { universalModule } from '../parts/actuators/universal';
import type { JointModuleBuilder } from '../parts/types';

export const JOINT_MODULES: Record<JointKind, JointModuleBuilder> = {
  revolute: rotaryModule,
  prismatic: linearModule,
  cylindrical: cylindricalModule,
  universal: universalModule,
  spherical: sphericalModule,
  planar: planarModule,
};
