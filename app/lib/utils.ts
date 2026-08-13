export const getMonth = (date: Date = new Date()) =>
  date.getMonth() + 12 * (date.getFullYear() - 1);

export const preventDefault = (f: () => void) => (event: Event) => {
  event.preventDefault();
  f();
};

interface WithTargetString {
  target: {
    value: string;
  };
}

export const withTargetValue =
  (f: (value: string) => void) => (event: WithTargetString) => {
    f(event.target.value);
  };
