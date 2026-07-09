/**
 * Virtual Live2D viewport used when a host window shows a cropped part of a
 * larger stage. Offsets are measured in CSS pixels from the virtual stage
 * origin to the visible window origin.
 */
export interface Live2DStageLayoutViewport {
  /** Virtual stage width in CSS pixels. */
  width: number
  /** Virtual stage height in CSS pixels. */
  height: number
  /** Horizontal crop offset from the virtual stage origin to the visible window. */
  offsetX: number
  /** Vertical crop offset from the virtual stage origin to the visible window. */
  offsetY: number
}

/**
 * Current Live2D model bounds in the virtual stage coordinate space.
 *
 * The bounds describe the visible portion of the fitted model after user
 * scale/position controls are applied and after clipping to the virtual stage.
 */
export interface Live2DModelLayoutBounds {
  /** Left edge of the model's visible bounds in virtual stage coordinates. */
  left: number
  /** Top edge of the model's visible bounds in virtual stage coordinates. */
  top: number
  /** Right edge of the model's visible bounds in virtual stage coordinates. */
  right: number
  /** Bottom edge of the model's visible bounds in virtual stage coordinates. */
  bottom: number
  /** Visible model width in CSS pixels. */
  width: number
  /** Visible model height in CSS pixels. */
  height: number
  /** Model center X before clipping to the virtual stage. */
  centerX: number
  /** Model center Y before clipping to the virtual stage. */
  centerY: number
  /** Virtual stage width used to compute the bounds. */
  stageWidth: number
  /** Virtual stage height used to compute the bounds. */
  stageHeight: number
  /** Final fitted Live2D scale after user scale is applied. */
  scale: number
}
