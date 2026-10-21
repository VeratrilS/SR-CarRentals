import Input from '../ui/Input';

export default function DriverForm({ register, errors, minAge = 18 }) {
  const err = (field) => errors?.driver?.[field]?.message;

  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">Primary driver</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Must be at least {minAge} and carry this driving licence at pickup.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Full name (as on licence)"
          placeholder="e.g. Sai Raghava"
          {...register('driver.name', { required: 'Name is required', minLength: { value: 2, message: 'Too short' } })}
          error={err('name')}
        />
        <Input
          label="Age"
          type="number"
          placeholder="Age"
          {...register('driver.age', {
            required: 'Age is required',
            valueAsNumber: true,
            min: { value: minAge, message: `Minimum age is ${minAge}` },
            max: { value: 80, message: 'Maximum age is 80' },
          })}
          error={err('age')}
        />
        <Input
          label="Driving licence number"
          placeholder="e.g. TS09 20210012345"
          {...register('driver.licenseNumber', {
            required: 'Licence number is required',
            validate: (v) => /^[A-Z0-9-]{8,20}$/i.test(String(v).replace(/\s+/g, '')) || 'Enter a valid licence number',
          })}
          error={err('licenseNumber')}
        />
        <Input
          label="Mobile number"
          type="tel"
          placeholder="e.g. +91 98765 43210"
          {...register('driver.phone', {
            required: 'Mobile number is required',
            validate: (v) => /^\+?[0-9]{10,13}$/.test(String(v).replace(/[\s-]+/g, '')) || 'Enter a valid mobile number',
          })}
          error={err('phone')}
        />
      </div>
    </div>
  );
}
