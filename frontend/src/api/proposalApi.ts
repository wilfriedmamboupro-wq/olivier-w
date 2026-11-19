import { getGlobalHttpInstance } from "./httpClient";
import { getProposalsEndpoint } from "./endpoints";
import type { Proposal } from "../domain/proposal";

export const getProposals = (): Promise<Proposal[]> => getGlobalHttpInstance().get<Proposal[]>(getProposalsEndpoint());
