import { Vector } from '../Math/vector';
/**
 * A definition of an EasingFunction. See {@apilink EasingFunctions}.
 */
export interface EasingFunction<TValueToEase = number> {
    (currentTime: number, startValue: TValueToEase, endValue: TValueToEase, duration: number): TValueToEase;
}
/**
 * Standard easing functions for motion in Excalibur, defined on a domain of [0, duration] and a range from [+startValue,+endValue]
 * Given a time, the function will return a value from positive startValue to positive endValue.
 *
 * ```js
 * function Linear (t) {
 *    return t * t;
 * }
 *
 * // accelerating from zero velocity
 * function EaseInQuad (t) {
 *    return t * t;
 * }
 *
 * // decelerating to zero velocity
 * function EaseOutQuad (t) {
 *    return t * (2 - t);
 * }
 *
 * // acceleration until halfway, then deceleration
 * function EaseInOutQuad (t) {
 *    return t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
 * }
 *
 * // accelerating from zero velocity
 * function EaseInCubic (t) {
 *    return t * t * t;
 * }
 *
 * // decelerating to zero velocity
 * function EaseOutCubic (t) {
 *    return (--t) * t * t + 1;
 * }
 *
 * // acceleration until halfway, then deceleration
 * function EaseInOutCubic (t) {
 *    return t < .5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
 * }
 * ```
 */
export declare class EasingFunctions {
    static CreateReversibleEasingFunction(easing: EasingFunction): EasingFunction;
    static CreateVectorEasingFunction(easing: EasingFunction<number>): EasingFunction<Vector>;
    static Linear: EasingFunction;
    static EaseInQuad: EasingFunction<number>;
    static EaseOutQuad: EasingFunction;
    static EaseInOutQuad: EasingFunction;
    static EaseInCubic: EasingFunction;
    static EaseOutCubic: EasingFunction;
    static EaseInOutCubic: EasingFunction;
}
