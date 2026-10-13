// SPDX-License-Identifier: MIT
// Keyable bone transform channels and the local-transform fields each one covers.

export const CHANNEL_FIELDS = {
  rotate: ['rotation'],
  translate: ['x', 'y'],
  scale: ['scale_x', 'scale_y'],
  shear: ['shear_x', 'shear_y'],
};

export const TRANSFORM_CHANNELS = Object.keys(CHANNEL_FIELDS);
