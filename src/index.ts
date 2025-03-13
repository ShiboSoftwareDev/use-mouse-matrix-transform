import {
  Matrix,
  identity,
  scale,
  translate,
  compose,
  applyToPoint,
} from "transformation-matrix"
import { useCallback, useEffect, useReducer, useRef, useState } from "react"

type Point = { x: number; y: number }

interface Props {
  canvasElm?: HTMLElement
  transform?: Matrix
  initialTransform?: Matrix
  onSetTransform?: (transform: Matrix) => any
  enabled?: boolean
  shouldDrag?: (e: MouseEvent) => boolean
}

export const useMouseMatrixTransform = (props: Props = {}) => {
  const extRef = useRef<any>(null)
  const [lastDragCancelTime, setLastDragCancelTime] = useState(0)
  const outerCanvasElm = props.canvasElm ?? extRef.current
  const [internalTransform, setInternalTransform] = useState<Matrix>(
    props.initialTransform ?? identity()
  )
  const [waitCounter, setWaitCounter] = useState(0)
  const [extChangeCounter, incExtChangeCounter] = useReducer((s) => s + 1, 0)
  const transformRef = useRef<Matrix>(props.transform ?? identity())

  const setTransform = useCallback(
    (newTransform: Matrix) => {
      transformRef.current = newTransform
      if (props.onSetTransform) {
        props.onSetTransform(newTransform)
      }
      if (!props.transform) {
        setInternalTransform(newTransform)
      }
    },
    [props.onSetTransform, setInternalTransform, props.transform]
  )

  const setTransformExt = useCallback(
    (newTransform: Matrix) => {
      setTransform(newTransform)
      incExtChangeCounter()
    },
    [setTransform]
  )

  const transform = props.transform ?? internalTransform

  const cancelDrag = useCallback(() => {
    setLastDragCancelTime(Date.now())
  }, [])

  const gestureModeRef = useRef<"none" | "drag" | "pinch">("none")
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null)
  const pinchDataRef = useRef<{
    initialDistance: number
    initialMidpoint: { x: number; y: number }
    initialTransform: Matrix
  } | null>(null)

  useEffect(() => {
    const canvasElm: HTMLCanvasElement | null =
      props.canvasElm ?? extRef.current
    if (canvasElm && !outerCanvasElm) {
      // Always re-render when the canvas element is known
      setWaitCounter(waitCounter + 1)
      return
    }
    if (!canvasElm) {
      const timeout = setTimeout(() => {
        setWaitCounter(waitCounter + 1)
      }, 100)
      return () => clearTimeout(timeout)
    }
    let init_tf = props.transform ?? internalTransform

    let m0: Point = { x: 0, y: 0 },
      m1: Point = { x: 0, y: 0 },
      md = false,
      mlastrel: Point = { x: 0, y: 0 }

    const getMousePos = (e: MouseEvent) => {
      return {
        x: e.pageX - canvasElm.getBoundingClientRect().left - window.scrollX,
        y: e.pageY - canvasElm.getBoundingClientRect().top - window.scrollY,
      }
    }

    function handleMouseDown(e: MouseEvent) {
      if (props.enabled === false) return
      if (props.shouldDrag && !props.shouldDrag(e)) return
      m0 = getMousePos(e)
      if (Date.now() - lastDragCancelTime < 100) return
      md = true
      e.preventDefault()
    }
    function handleMouseUp(e: MouseEvent) {
      if (!md || props.enabled === false) return
      if (props.shouldDrag && !props.shouldDrag(e)) return
      m1 = getMousePos(e)

      const new_tf = compose(translate(m1.x - m0.x, m1.y - m0.y), init_tf)
      setTransform(new_tf)
      init_tf = new_tf

      md = false
    }
    function handleMouseMove(e: MouseEvent) {
      mlastrel = getMousePos(e)
      if (!md || props.enabled === false) return
      if (props.shouldDrag && !props.shouldDrag(e)) return
      m1 = getMousePos(e)

      setTransform(compose(translate(m1.x - m0.x, m1.y - m0.y), init_tf))
    }
    function handleMouseWheel(e: WheelEvent) {
      if (props.enabled === false) return
      if (props.shouldDrag && !props.shouldDrag(e)) return
      const center = getMousePos(e)
      const new_tf = compose(
        translate(center.x, center.y),
        scale(1 - e.deltaY / 1000, 1 - e.deltaY / 1000),
        translate(-center.x, -center.y),
        init_tf
      )
      setTransform(new_tf)
      init_tf = new_tf
      e.preventDefault()
    }
    function handleMouseOut(e: MouseEvent) {
      if (!md) return
      if (props.shouldDrag && !props.shouldDrag(e)) return

      // If the mouseout occurs in the bounding box of the canvasElm, it's
      // defocusing on internal elements, so we should ignore it
      if (canvasElm) {
        const boundingBox = canvasElm.getBoundingClientRect()
        if (
          e.clientX >= boundingBox.left + 10 &&
          e.clientX <= boundingBox.right - 10 &&
          e.clientY >= boundingBox.top + 10 &&
          e.clientY <= boundingBox.bottom - 10
        ) {
          return
        }
      }

      md = false
      m1 = getMousePos(e)

      const new_tf = compose(translate(m1.x - m0.x, m1.y - m0.y), init_tf)
      setTransform(new_tf)
      init_tf = new_tf
    }

    function handleTouchStart(e: TouchEvent) {
      if (props.enabled === false) return
      if (e.touches.length === 1) {
        gestureModeRef.current = "drag"
        const touch = e.touches[0]
        console.log('touch: ', touch)
        lastTouchRef.current = { x: touch.clientX, y: touch.clientY }
      } else if (e.touches.length === 2) {
        console.log('pinch')
        gestureModeRef.current = "pinch"
        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        const dx = touch2.clientX - touch1.clientX
        const dy = touch2.clientY - touch1.clientY
        const distance = Math.hypot(dx, dy)
        const midpoint = {
          x: (touch1.clientX + touch2.clientX) / 2,
          y: (touch1.clientY + touch2.clientY) / 2,
        }
        pinchDataRef.current = {
          initialDistance: distance,
          initialMidpoint: midpoint,
          initialTransform: transformRef.current,
        }
      }
      e.preventDefault()
    }

    function handleTouchMove(e: TouchEvent) {
      if (props.enabled === false) return
      if (
        gestureModeRef.current === "drag" &&
        e.touches.length === 1 &&
        lastTouchRef.current
      ) {
        const touch = e.touches[0]
        const deltaX = touch.clientX - lastTouchRef.current.x
        const deltaY = touch.clientY - lastTouchRef.current.y

        requestAnimationFrame(() => {
          const newTransform = { ...transformRef.current, e: transformRef.current.e + deltaX, f: transformRef.current.f + deltaY }
          setTransform(newTransform)
        })

        lastTouchRef.current = { x: touch.clientX, y: touch.clientY }
      } else if (
        gestureModeRef.current === "pinch" &&
        e.touches.length === 2 &&
        pinchDataRef.current
      ) {
        console.log('pinch')
        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        const dx = touch2.clientX - touch1.clientX
        const dy = touch2.clientY - touch1.clientY
        const newDistance = Math.hypot(dx, dy)
        const { initialDistance, initialMidpoint, initialTransform } = pinchDataRef.current
        const scaleFactor = newDistance / initialDistance

        requestAnimationFrame(() => {
          const newTransform = compose(
            translate(initialMidpoint.x, initialMidpoint.y),
            scale(scaleFactor, scaleFactor),
            translate(-initialMidpoint.x, -initialMidpoint.y),
            initialTransform
          )
          setTransform(newTransform)
        })
      }
    }

    function handleTouchEnd(e: TouchEvent) {
      if (e.touches.length === 0) {
        gestureModeRef.current = "none"
        lastTouchRef.current = null
        pinchDataRef.current = null
      }
      e.preventDefault()
    }

    canvasElm.addEventListener("mousedown", handleMouseDown)
    canvasElm.addEventListener("mouseup", handleMouseUp)
    window.addEventListener("mousemove", handleMouseMove)
    canvasElm.addEventListener("mouseout", handleMouseOut)
    canvasElm.addEventListener("wheel", handleMouseWheel)

    canvasElm.addEventListener("touchstart", handleTouchStart, { passive: false })
    canvasElm.addEventListener("touchmove", handleTouchMove, { passive: false })
    canvasElm.addEventListener("touchend", handleTouchEnd, { passive: false })
    canvasElm.addEventListener("touchcancel", handleTouchEnd, { passive: false })

    return () => {
      canvasElm.removeEventListener("mousedown", handleMouseDown)
      canvasElm.removeEventListener("mouseup", handleMouseUp)
      window.removeEventListener("mousemove", handleMouseMove)
      canvasElm.removeEventListener("mouseout", handleMouseOut)
      canvasElm.removeEventListener("wheel", handleMouseWheel)

      canvasElm.removeEventListener("touchstart", handleTouchStart)
      canvasElm.removeEventListener("touchmove", handleTouchMove)
      canvasElm.removeEventListener("touchend", handleTouchEnd)
      canvasElm.removeEventListener("touchcancel", handleTouchEnd)
    }
  }, [outerCanvasElm,
     waitCounter,
     extChangeCounter, 
     lastDragCancelTime, 
     props.enabled, 
     props.shouldDrag,
    ])

  const applyTransformToPoint = useCallback(
    (obj: Point | [number, number]) => applyToPoint(transformRef.current, obj),
    [transform]
  )

  return {
    ref: extRef,
    transform: transformRef.current,
    applyTransformToPoint,
    setTransform: setTransformExt,
    cancelDrag
  }
}

export default useMouseMatrixTransform
