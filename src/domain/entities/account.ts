export type Account = {
  readonly id: number;
  readonly phone: string;
  readonly firstName: string;
  readonly lastName: string | null;
  readonly username: string | null;
  readonly alias: string;
  readonly isDefault: boolean;
};
