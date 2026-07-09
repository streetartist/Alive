/**
 * Current Live2D model bounds in the stage coordinate space.
 *
 * The bounds describe the visible portion of the fitted model after user
 * scale/position controls are applied and after clipping to the stage.
 */
export interface Live2DModelLayoutBounds {
  /** Left edge of the model's visible bounds in stage coordinates. */
  left: number
  /** Top edge of the model's visible bounds in stage coordinates. */
  top: number
  /** Right edge of the model's visible bounds in stage coordinates. */
  right: number
  /** Bottom edge of the model's visible bounds in stage coordinates. */
  bottom: number
  /** Visible model width in CSS pixels. */
  width: number
  /** Visible model height in CSS pixels. */
  height: number
  /** Model center X before clipping to the virtual stage. */
  centerX: number
  /** Model center Y before clipping to the virtual stage. */
  centerY: number
  /** Stage width used to compute the bounds. */
  stageWidth: number
  /** Stage height used to compute the bounds. */
  stageHeight: number
  /** Final fitted Live2D scale after user scale is applied. */
  scale: number
}
