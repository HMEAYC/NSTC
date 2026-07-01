interface Props {
  size?: "sm" | "md" | "lg";
  text?: string;
}

const sizeMap = {
  sm: "h-5 w-5 border-2",
  md: "h-8 w-8 border-3",
  lg: "h-12 w-12 border-4",
};

export default function LoadingSpinner({ size = "md", text }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <div
        className={`${sizeMap[size]} animate-spin rounded-full border-gray-300 border-t-blue-600`}
      />
      {text && <p className="text-gray-400 text-sm">{text}</p>}
    </div>
  );
}
