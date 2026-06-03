import { InMemoryStore } from '../src/in-memory';
import { runStoreContract } from './store-contract';

runStoreContract('InMemoryStore', () => new InMemoryStore());
