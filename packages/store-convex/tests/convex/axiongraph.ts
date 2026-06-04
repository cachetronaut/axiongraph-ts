import { componentsGeneric } from 'convex/server';
import { type AxiongraphComponent, exposeAxiongraph } from '../../src/server';

// The one-liner a consuming app writes, modeled for the test. In a real app `components` comes
// from `./_generated/api`; here `componentsGeneric()` builds the same child-component references
// that `convex-test`'s `registerComponent('axiongraph', ...)` resolves.
const components = componentsGeneric() as unknown as { axiongraph: AxiongraphComponent };

export const { append, readEvents } = exposeAxiongraph(components.axiongraph);
