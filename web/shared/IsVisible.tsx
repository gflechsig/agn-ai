import { Component, createSignal, onCleanup, onMount } from 'solid-js'

type Props = {
  onEnter: () => void
  onLeave: () => void
}

const IsVisible: Component<Props> = (props) => {
  let ref: any

  const [visible, setVisible] = createSignal(false)
  const [obs, setObs] = createSignal(
    new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (visible()) return
          props.onEnter()
          setVisible(true)
          return
        }

        if (!visible()) return
        props.onLeave()
        setVisible(false)
      },
      {
        root: null,
        threshold: 0.1,
      }
    )
  )

  onMount(() => {
    obs().observe(ref)
  })

  onCleanup(() => {
    obs().unobserve(ref)
  })

  return <span ref={ref}></span>
}
