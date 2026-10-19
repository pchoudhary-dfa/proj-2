export default function RequiredLabel({label}:{label: string}) {
    return (
      <span className="flex items-center gap-1 form-label text-text">
        <span className="text-error">*</span>
        {label}
      </span>
    );
  }