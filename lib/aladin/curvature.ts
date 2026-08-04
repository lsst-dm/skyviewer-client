/**
 * Where "zoomed out" starts.
 *
 * The viewer projects the sphere orthographically (SIN), so the further out
 * the view is pulled the more the sky reads as a curved surface rather than a
 * flat picture: straight lines bow, and the scale at the edge of the frame
 * falls off as the cosine of the angle from the centre. At a 40 degree field
 * that fall-off reaches 6%, which is where grid lines start to visibly arc;
 * below about 30 degrees the frame is flat enough that a flat map is an honest
 * comparison for it.
 *
 * The two thresholds are deliberately apart: a single one would flicker while
 * a zoom animation settles on top of it, and both things that depend on this
 * (turning the coordinate grid on, swapping the Earth comparison between a
 * flat map and a globe) are too heavy to toggle twice a second.
 */
export const CURVED_SKY_FOV = 40;
export const FLAT_SKY_FOV = 30;

/**
 * Whether the sky's curvature is visible at this field of view, given whether
 * it was visible a moment ago.
 *
 * @param fov horizontal field of view, in degrees
 * @param wasCurved the previous answer, which sets which threshold applies
 */
export const isSkyCurved = (fov: number, wasCurved: boolean): boolean => {
  return wasCurved ? fov > FLAT_SKY_FOV : fov >= CURVED_SKY_FOV;
};
