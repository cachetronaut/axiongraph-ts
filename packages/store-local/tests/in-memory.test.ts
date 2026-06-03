import { runStoreContract } from '@axiongraph/testkit';
import { InMemoryStore } from '../src/in-memory';

runStoreContract('InMemoryStore', () => new InMemoryStore());
