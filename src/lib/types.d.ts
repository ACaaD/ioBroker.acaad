export interface TargetService {
    name: string;
    host: string;
    port: number;
    signalrPort: number;
}

export interface Authentication {
    tokenUrl: string;
    clientId: string;
    clientSecret: string;
}
