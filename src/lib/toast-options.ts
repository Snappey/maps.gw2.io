/**
 * Shared ngx-toastr option objects. The app uses a custom toast skin
 * (`custom-toastr`) in two fixed positions; these consts keep the literal in
 * one place instead of being re-typed at every call site.
 */
export const TOAST_TOP_RIGHT = {toastClass: "custom-toastr", positionClass: "toast-top-right"};
export const TOAST_BOTTOM_LEFT = {toastClass: "custom-toastr", positionClass: "toast-bottom-left"};
