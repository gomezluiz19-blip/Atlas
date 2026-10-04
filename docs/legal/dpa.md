# Data Processing Addendum

This addendum ("DPA") forms part of the agreement between {{COMPANY}} ("Processor", "we") and the organization
that signs it ("Customer", "you") for {{PRODUCT}} (the "Service"). It applies when we process personal
information in Customer Data on your behalf.

## 1. Roles

You decide what personal information goes into your workspaces and why: you are the controller (or "business").
We process it only to provide the Service: we are your processor (or "service provider"/"contractor" under US
state privacy laws).

## 2. Instructions

We process Customer Data only on your documented instructions, which are: this DPA, the Terms, your use and
configuration of the Service, and any other written instruction you give that's consistent with them. We'll tell
you if we think an instruction breaks the law. We won't sell or share Customer Data, use it for advertising, use
it to train AI models, or combine it with other data except as needed to provide the Service.

## 3. Confidentiality and personnel

Everyone we authorize to access Customer Data is bound by confidentiality and accesses it only as needed to
provide or support the Service.

## 4. Security

We maintain the measures in [Annex A](#annex-a-security-measures), and won't materially reduce them during the
agreement.

## 5. Subprocessors

You authorize the subprocessors listed on our [subprocessors page](subprocessors.html). We'll give you at least
30 days' notice of a new one (by email to your account owner or on that page); you may object on reasonable data
protection grounds, and if we can't resolve it, you may end the affected part of the Service with a pro-rated
refund. We're responsible for our subprocessors as for ourselves.

## 6. Requests from individuals

We'll help you, through the Service's features and otherwise as reasonably needed, to answer people exercising
their rights (access, correction, deletion, portability). If someone asks us directly about your workspace,
we'll pass the request to you.

## 7. Incidents

If we become aware of a breach of security leading to unauthorized access to, or loss or disclosure of, Customer
Data, we'll tell you without undue delay and within 72 hours, with what we know, what we're doing, and a contact.
We'll keep you updated and help you meet your own notification obligations.

## 8. Deletion and return

You can download Customer Data at any time. Within 30 days after the agreement ends we'll delete it (and from
backups within a further 30 days), unless the law requires us to keep it, in which case we'll keep it secure and
use it for nothing else.

## 9. Audits

We'll provide information reasonably needed to show we comply with this DPA, including our security overview,
our subprocessors' certifications and, when available, our own independent audit reports. Where that isn't
enough, you may audit us once a year on 30 days' notice, during business hours, at your cost, under
confidentiality.

## 10. Location and transfers

Customer Data is stored in the United States. If you're subject to EU or UK law, the Standard Contractual Clauses
(or UK Addendum) are incorporated for transfers that need them.

## 11. Student data (schools and districts)

Where Customer Data includes education records or student personal information:

- For FERPA, we act as a "school official" with a legitimate educational interest, under your direct control
  as to the use and maintenance of education records, and we use them only for the purposes you authorize.
- We won't use student information for targeted advertising, to build profiles for non-educational purposes,
  or sell it, and we comply with applicable state student-privacy laws (for example SOPIPA-style laws, Maryland's
  Student Data Privacy Act and New York Education Law 2-d). We'll sign a state's standard data privacy agreement
  where your state uses one.
- Parents and eligible students exercise their rights through you; we'll help you respond.
- On request, we'll delete student information within the period your state's law requires.

## 12. Government customers

Where a public-records or open-records law applies to you, you're responsible for responding to requests; we'll
help retrieve Customer Data. Where your procurement rules require specific terms (for example on data location,
background checks or breach notice), we'll agree them in your order form, which takes precedence.

## Annex A: Security measures

- **Access control.** Every database table enforces row-level security: people reach only their own data and the
  workspaces they belong to, in the role they've been given (owner, editor, viewer). Roles are checked by the
  database, not by the web page.
- **Authentication.** Sign-in by one-time code to the person's email; sessions expire and refresh.
- **Encryption.** In transit (TLS) everywhere; at rest by our database and hosting providers.
- **Integrity and recovery.** Every workspace save is versioned; a save from an out-of-date copy is refused;
  earlier versions can be restored; customers can export at any time; the database is backed up daily (7-day retention).
- **Secrets.** Service keys are held server-side, never shipped in the web page.
- **Least privilege.** Production access is limited to named people, with multi-factor authentication.
- **Development.** Code review, automated tests on every change, dependency updates, and no customer data in
  development.
- **Incidents.** A documented response process with notification as in section 7.
- **Vulnerability reports.** {{SECURITY_EMAIL}} (see /.well-known/security.txt).

Signed for {{COMPANY}}: ______________________ Date: __________

Signed for Customer: ______________________ Date: __________
