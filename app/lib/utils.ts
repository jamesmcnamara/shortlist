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

export const getInitials = (name: string) => {
  const parts = name.split(" ");
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0].slice(0, 1) + parts[1].slice(0, 1)).toUpperCase();
};

export const getColor = (text: string) => {
  const colors = ["violet", "lilac", "mint", "gold"];
  const index =
    text.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) %
    colors.length;
  return colors[index];
};
