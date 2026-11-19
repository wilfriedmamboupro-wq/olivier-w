import { getGlobalHttpInstance } from "./httpClient";
import { createRfpEndpoint, getAirportsEndpoint, getRfpByIdEndpoint, getRfpsEndpoint, resumeRfpEndpoint } from "./endpoints";
import type { CreateRfpRequestDto, ResumeRequestDto } from "../dto/rfp.dto";
import type { Rfp } from "../domain/rfp";

export const getAirports = (): Promise<string[]> => getGlobalHttpInstance().get<string[]>(getAirportsEndpoint());

export const getRfps = (): Promise<Rfp[]> => getGlobalHttpInstance().get<Rfp[]>(getRfpsEndpoint());

export const getRfpById = (rfpId: string): Promise<Rfp> => getGlobalHttpInstance().get<Rfp>(getRfpByIdEndpoint(rfpId));

export const createRfp = (request: CreateRfpRequestDto): Promise<Rfp> =>
  getGlobalHttpInstance().post<Rfp>(createRfpEndpoint(), request);

export const resumeRfp = (rfpId: string, request: ResumeRequestDto["payload"]): Promise<Rfp> =>
  getGlobalHttpInstance().post<Rfp>(resumeRfpEndpoint(rfpId), { payload: request });
