import { makePersisted } from "@solid-primitives/storage";
import Resizable from "corvu/resizable";
import { createSignal, Signal, JSX } from "solid-js";

export default function Panel(props: Readonly<{ children: JSX.Element, onSizesChange: (sizes: number[]) => void }>) {
  const [sizes, setSizes] = makePersisted(createSignal<number[]>([]), {
    name: 'resizable-sizes'
  })
  

  return (
    <Resizable sizes={sizes()} onSizesChange={(sizes) => {
        setSizes(sizes)
        props.onSizesChange(sizes)
    }} class="size-full">
      <Resizable.Panel>
        {props.children}
      </Resizable.Panel>
      <Resizable.Handle class="w-1 h-full bg-gray-200" />
      <Resizable.Panel>
        other
      </Resizable.Panel>

    </Resizable>
  );
}